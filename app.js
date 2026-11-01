import * as pg from "./pages.js";
import { LIBRARY } from "./library.js";
import { scaleLine, buildList, itemText, ORDER } from "./scale.js";
import * as fb from "./firebase-config.js";
import { onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, doc, getDoc, getDocs, updateDoc, deleteDoc, query, orderBy, where, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const { auth, db, provider } = fb, IMPORT_PROXY = fb.IMPORT_PROXY || ""; // IMPORT_PROXY is optional in firebase-config.js

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lines = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);
const app = $("#app");
let user = null, ready = false, recipes = null, isStaff = false, isReserve = false, unsub = null;
const FREE_LIMIT = 50;

const toast = m => { const t = $("#toast"); t.textContent = m; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 2600); };
const col = () => collection(db, "users", user.uid, "recipes");

let stopReserve = null;
onAuthStateChanged(auth, async u => {
  stopReserve?.(); stopReserve = null;
  user = u; isStaff = isReserve = false; recipes = null;
  if (u) {
    setDoc(doc(db, "profiles", u.uid), { name: u.displayName || "", email: u.email || "", photo: u.photoURL || "", lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    const [a, b] = await Promise.all([getDoc(doc(db, "staff", u.uid)).catch(() => null), getDoc(doc(db, "reserve", u.uid)).catch(() => null)]);
    isStaff = !!a?.exists(); isReserve = !!b?.exists();
    stopReserve = onSnapshot(doc(db, "reserve", u.uid), x => { if (x.exists() !== isReserve) { isReserve = x.exists(); if (isReserve) toast("Garde Reserve is now active"); route(); } }, () => {});
  }
  ready = true; route();
});
window.addEventListener("hashchange", route);

async function login() {
  try { await signInWithPopup(auth, provider); location.hash = "#/dashboard"; }
  catch (e) { toast("Sign-in didn't finish. Try again."); }
}

function nav() {
  const h = location.hash || "#/";
  const l = (href, label) => `<a class="l" href="${href}" ${h === href ? "aria-current=page" : ""}>${label}</a>`;
  const lh = (href, label) => l(href, label).replace('class="l"', 'class="l hide"');
  $("#nav").innerHTML = `<a class="logo" href="#/">Garde</a>` + (user
    ? `${l("#/dashboard", "Recipes")}${l("#/collections", "Collections")}${l("#/sous", "Sous")}${l("#/pantry", "Pantry")}${l("#/add", "Add")}${l("#/support", "Support")}${l("#/reserve", "Reserve")}${isStaff ? l("#/staff", "Staff") : ""}<a href="#/settings" aria-label="Settings"><img class="avatar" src="${esc(user.photoURL || "")}" alt="" referrerpolicy="no-referrer"></a>`
    : `${l("#/", "Home")}${lh("#/features", "Features")}${lh("#/reserve", "Reserve")}${lh("#/support", "Support")}${lh("#/about", "About")}<a class="btn main" href="#/login">Sign in</a>`);
  $("#foot").innerHTML = pg.footer();
  const o = $("#out"); if (o) o.onclick = () => signOut(auth).then(() => location.hash = "#/");
}

async function route() {
  if (!ready) return;
  nav();
  unsub?.(); unsub = null;
  const [, page, id] = (location.hash || "#/").split("/");
  const guarded = ["dashboard", "add", "recipe", "edit", "collections", "pantry", "shopping", "settings", "ticket", "staff", "sous"];
  if (guarded.includes(page) && !user) { location.hash = "#/login"; return; }
  if (page === "login" && user) { location.hash = "#/dashboard"; return; }
  ({ "": home, login: loginView, dashboard, add: () => form(), recipe: () => detail(id), edit: () => form(id), features: stat("features"), about: stat("about"), collections, pantry, shopping: pantry, settings, support, ticket: () => ticket(id), staff: () => staff(id), reserve, sous }[page] || home)();
  window.scrollTo(0, 0);
}

const home = () => { app.innerHTML = pg.home(user); };
const stat = f => () => { app.innerHTML = pg[f](); };

function loginView() {
  app.innerHTML = `<div class="center glass"><h2>Welcome to Garde</h2><p>Sign in or create your account with Google. Your recipes stay private to you.</p><button class="btn main" id="g">Continue with Google</button></div>`;
  $("#g").onclick = login;
}

async function load() {
  if (recipes) return recipes;
  const snap = await getDocs(query(col(), orderBy("createdAt", "desc")));
  return recipes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function dashboard() {
  app.innerHTML = `<h2>My recipes</h2><p class="status">Loading…</p>`;
  let all;
  try { all = await load(); } catch (e) { app.innerHTML = `<h2>My recipes</h2><div class="empty glass"><h3>Couldn't load your recipes</h3>Check your Firebase config and Firestore rules, then refresh.</div>`; return; }
  let q = "", fav = false;
  app.innerHTML = `<h2>My recipes</h2>
    <div class="bar"><input id="q" type="search" placeholder="Search by name, ingredient or tag" aria-label="Search recipes"><button class="chip" id="fav" aria-pressed="false">Favorites</button><a class="btn main" href="#/add">Add recipe</a></div>
    <div id="list"></div>`;
  const draw = () => {
    const f = all.filter(r => (!fav || r.favorite) && (`${r.title} ${(r.tags || []).join(" ")} ${(r.ingredients || []).join(" ")}`).toLowerCase().includes(q));
    $("#list").innerHTML = !all.length
      ? `<div class="empty glass"><h3>No recipes yet</h3>Add your first one from a link, a photo, or by typing it in.<br><a class="btn main" href="#/add">Add recipe</a></div>`
      : !f.length ? `<div class="empty glass"><h3>Nothing matches</h3>Try a different search or clear the Favorites filter.</div>`
      : `<div class="grid">${f.map(r => `<a class="rc glass" href="#/recipe/${r.id}"><div class="img"><span>${esc((r.title || "?").trim()[0] || "?")}</span>${r.image ? `<img src="${esc(r.image)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">` : ""}</div><div class="body"><h3>${r.favorite ? "★ " : ""}${esc(r.title)}</h3><small>${esc([r.time, r.servings && r.servings + " servings"].filter(Boolean).join(" · ") || "No details yet")}</small></div></a>`).join("")}</div>`;
  };
  $("#q").oninput = e => { q = e.target.value.toLowerCase(); draw(); };
  $("#fav").onclick = e => { fav = !fav; e.target.setAttribute("aria-pressed", fav); draw(); };
  draw();
}

async function detail(id) {
  const s = await getDoc(doc(db, "users", user.uid, "recipes", id));
  if (!s.exists()) { app.innerHTML = `<div class="empty glass"><h3>Recipe not found</h3><a class="btn" href="#/dashboard">Back to my recipes</a></div>`; return; }
  const r = { id, ...s.data() }, base = parseInt(r.servings) || 0;
  app.innerHTML = `<div class="detail">
    ${r.image ? `<img class="cover" src="${esc(r.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
    <div class="hdr"><div><h2>${esc(r.title)}</h2><p class="meta">${esc([r.time, r.servings && r.servings + " servings", (r.tags || []).join(", ")].filter(Boolean).join(" · "))}${r.source ? ` · <a href="${esc(r.source)}" target="_blank" rel="noopener noreferrer">Original</a>` : ""}</p></div>
      <div class="row"><button class="btn" id="fv">${r.favorite ? "★ Favorited" : "☆ Favorite"}</button><button class="btn" id="pn"></button><a class="btn" href="#/edit/${id}">Edit</a><button class="btn danger" id="del">Delete</button></div></div>
    <div class="panel glass"><div class="row" style="justify-content:space-between"><h3>Ingredients</h3>${base ? `<span class="step"><button id="mn" aria-label="Fewer servings">−</button><b id="sv"></b><small>servings</small><button id="pl" aria-label="More servings">+</button></span>` : ""}</div><ul id="il"></ul></div>
    <div class="panel glass"><h3>Steps</h3><ol>${(r.steps || []).map(i => `<li>${esc(i)}</li>`).join("")}</ol>${r.notes ? `<h3 style="margin-top:28px">Notes</h3><p class="meta notes">${esc(r.notes)}</p>` : ""}</div></div>`;
  $("#fv").onclick = async () => { await updateDoc(doc(db, "users", user.uid, "recipes", id), { favorite: !r.favorite }); recipes = null; detail(id); };
  $("#del").onclick = async () => { if (!confirm(`Delete "${r.title}"? This can't be undone.`)) return; await deleteDoc(doc(db, "users", user.uid, "recipes", id)); recipes = null; toast("Recipe deleted"); location.hash = "#/dashboard"; };
  let cur = lsGet("garde.serv", {})[id] || base;
  const showIng = () => { const k = base ? cur / base : 1; $("#il").innerHTML = (r.ingredients || []).map(i => `<li>${esc(scaleLine(i, k))}</li>`).join(""); if (base) $("#sv").textContent = cur; };
  const stepTo = d => { cur = Math.max(1, Math.min(99, cur + d)); const m = lsGet("garde.serv", {}); m[id] = cur; lsSet("garde.serv", m); showIng(); };
  if (base) { $("#mn").onclick = () => stepTo(-1); $("#pl").onclick = () => stepTo(1); }
  showIng();
  const pk = () => lsGet("garde.pick", []), paint = () => { $("#pn").textContent = pk().includes(id) ? "✓ In Pantry" : "Add to Pantry"; };
  paint(); $("#pn").onclick = () => { lsSet("garde.pick", pk().includes(id) ? pk().filter(x => x !== id) : [...pk(), id]); paint(); };
}

// ---- Import helpers ----
const txt = h => new DOMParser().parseFromString(String(h ?? ""), "text/html").body.textContent.trim();
const dur = iso => { const m = /P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(iso || ""); return m && (m[1] || m[2]) ? [m[1] && m[1] + " h", m[2] && m[2] + " min"].filter(Boolean).join(" ") : ""; };
const flat = n => !n ? [] : typeof n === "string" ? [n] : Array.isArray(n) ? n.flatMap(flat) : n.itemListElement ? flat(n.itemListElement) : n.text ? [n.text] : [];
const absUrl = (u, base) => { try { return u ? new URL(u, base).href.replace(/^http:/, "https:") : ""; } catch { return ""; } };
const PROXIES = [...(IMPORT_PROXY ? [u => IMPORT_PROXY + "?url=" + encodeURIComponent(u)] : []), u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u), u => "https://corsproxy.io/?url=" + encodeURIComponent(u), u => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u)];
const grab = async (u, ms = 12000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw 0; const x = await r.text(); if (x.length < 300) throw 0; return x; } finally { clearTimeout(t); } };

// Turns loose text (page text or OCR) into title / ingredients / steps
const JUNK = /^(print|pin|save|rate|share|jump to|did you make|leave a|subscribe|advertisement|skip to)\b/i;
const QTY = /^(?:\d+(?:[.,/]\d+)?(?:\s+\d\/\d)?|[¼½¾⅓⅔⅛])\s*(?:-\s*\d+)?\s*(?:cups?|c|tbsps?|tsps?|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|liters?|cloves?|pinch|dash|cans?|sticks?|slices?|pieces?)?\b/i;
function parseText(text) {
  const out = { title: "", ingredients: [], steps: [], time: "", servings: "" };
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 1);
  const hasHead = lines.some(l => /^[#*\s]*ingredients?[*:\s]*$/i.test(l));
  let mode = "";
  for (const l of lines) {
    const h = l.replace(/^[#*\s]+|[*:\s]+$/g, "");
    if (/^ingredients?$/i.test(h)) { mode = "i"; continue; }
    if (/^(instructions?|directions?|method|steps?|preparation|procedure)$/i.test(h)) { mode = "s"; continue; }
    if (/^#{1,6}\s/.test(l)) { if (mode) mode = "x"; else if (!out.title) out.title = h; continue; }
    const sv = /(?:serves|servings?|yield|makes)\s*:?\s*(\d+)/i.exec(l); if (sv && !out.servings) out.servings = sv[1];
    const tm = /(?:total|ready in)(?:\s*time)?\s*:?\s*(\d+\s*(?:h|hr|hrs|hours?|min|minutes?)(?:\s*\d+\s*(?:min|minutes?))?)/i.exec(l); if (tm && !out.time) out.time = tm[1];
    const c = l.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^[*\-•·▢☐\s]+/, "").replace(/^\d+[.)]\s+/, "").replace(/\*+/g, "").trim();
    if (!c || JUNK.test(c)) continue;
    if (mode === "i") { if (c.length < 140) out.ingredients.push(c); }
    else if (mode === "s") { out.steps.push(c); if (out.steps.length >= 30) mode = "x"; }
    else if (mode === "") {
      if (hasHead) { if (!out.title && c.length < 80) out.title = c; }
      else if (!out.title && c.length < 70 && !QTY.test(c)) out.title = c;
      else if (QTY.test(c) && c.length < 70) out.ingredients.push(c);
      else if (c.length > 25 && out.ingredients.length) out.steps.push(c);
    }
  }
  return out;
}

function fromHtml(h, url) {
  const dom = new DOMParser().parseFromString(h, "text/html");
  const og = k => dom.querySelector(`meta[property="og:${k}"]`)?.content || "";
  let rec = null;
  const find = n => { if (!n || rec || typeof n !== "object") return; if (Array.isArray(n)) return n.forEach(find); if ([].concat(n["@type"] || []).some(t => /Recipe$/i.test(t))) { rec = n; return; } Object.values(n).forEach(find); };
  dom.querySelectorAll('script[type="application/ld+json"]').forEach(s => { try { find(JSON.parse(s.textContent.replace(/[\u0000-\u001f]+/g, " "))); } catch {} });
  if (rec) {
    const img = [].concat(rec.image || [])[0];
    return { title: txt(rec.name), source: url, time: dur(rec.totalTime), servings: String([].concat(rec.recipeYield || [""])[0]).replace(/\D.*/, ""),
      image: absUrl(typeof img === "string" ? img : img?.url || og("image"), url), ingredients: [].concat(rec.recipeIngredient || []).map(txt), steps: flat(rec.recipeInstructions).map(txt),
      tags: [].concat(rec.recipeCategory || [], String(rec.keywords || "").split(",")).map(t => String(t).trim()).filter(Boolean).slice(0, 5) };
  }
  const title = txt(og("title") || dom.querySelector("h1")?.textContent || dom.title).split(/\s[|–-]\s/)[0];
  const pickAll = sels => { for (const q of sels) { const x = [...dom.querySelectorAll(q)].map(e => txt(e.innerHTML).replace(/\s+/g, " ")).filter(l => l && l.length < 400); if (x.length > 1) return x; } return []; };
  // Recipe-card plugins and microdata hold only the real recipe, so the backstory is never touched
  let ing = pickAll(['[itemprop="recipeIngredient"]', '[itemprop="ingredients"]', ".wprm-recipe-ingredient", ".tasty-recipes-ingredients li", ".mv-create-ingredients li", ".recipe-ingredients li", '[class*="ingredient"] li']).filter(l => l.length < 160);
  let steps = pickAll(['[itemprop="recipeInstructions"] li', '[itemprop="recipeInstructions"] p', ".wprm-recipe-instruction-text", ".tasty-recipes-instructions li", ".mv-create-instructions li", ".recipe-instructions li", '[class*="instruction"] li', '[class*="direction"] li']);
  if (ing.length < 2 || !steps.length) { const h = byHeading(dom); if (ing.length < 2) ing = h.ing; if (!steps.length) steps = h.steps; }
  return ing.length > 1 ? { title, source: url, image: absUrl(og("image"), url), ingredients: ing, steps } : null;
}

// Last resort: find the "Ingredients" and "Instructions" headings and take only the list or steps right after them
function byHeading(dom) {
  const heads = [...dom.querySelectorAll("h1,h2,h3,h4,h5,h6,strong,b")], lists = [...dom.querySelectorAll("ul,ol")];
  const grab = re => {
    const h = heads.find(x => re.test(x.textContent.trim().replace(/[:\s]+$/, ""))); if (!h) return [];
    const l = lists.find(x => (h.compareDocumentPosition(x) & 4) && !x.contains(h) && x.querySelectorAll(":scope > li").length > 1);
    if (l) return [...l.querySelectorAll(":scope > li")].map(e => txt(e.innerHTML).replace(/\s+/g, " ")).filter(Boolean);
    const out = []; let n = (h.closest("h1,h2,h3,h4,h5,h6,p,div") || h).nextElementSibling;
    while (n && !/^H[1-6]$/.test(n.tagName) && out.length < 30) { if (n.tagName === "P" && n.textContent.trim().length > 15) out.push(txt(n.innerHTML)); n = n.nextElementSibling; }
    return out;
  };
  return { ing: grab(/^ingredients?$/i).filter(l => l.length < 160), steps: grab(/^(instructions?|directions?|method|steps?|preparation)$/i) };
}

function fromText(md, url) {
  const title = (/^Title:\s*(.+)$/m.exec(md) || [])[1] || "";
  const p = parseText(md.replace(/^(Title|URL Source|Markdown Content|Published Time):.*$/gm, ""));
  if (p.ingredients.length < 2 || !p.steps.length) return null;
  const img = [...md.matchAll(/!\[[^\]]*\]\((https?:[^)\s]+)\)/g)].map(m => m[1]).find(u => /\.(jpe?g|png|webp)/i.test(u) && !/logo|icon|avatar|sprite|badge/i.test(u));
  return { ...p, title: txt(title.split(/\s[|–-]\s/)[0]) || p.title, source: url, image: img || "" };
}

async function importUrl(url) {
  let seen = "";
  const tries = [
    ...PROXIES.map(p => grab(p(url)).then(h => { seen ||= h; return fromHtml(h, url) || Promise.reject(); })),
    grab("https://r.jina.ai/" + url, 25000).then(m => fromText(m, url) || Promise.reject())
  ];
  try { return await Promise.any(tries); } catch {}
  if (!seen) throw new Error("fetch");
  const dom = new DOMParser().parseFromString(seen, "text/html"), og = k => dom.querySelector(`meta[property="og:${k}"]`)?.content || "";
  throw Object.assign(new Error("norecipe"), { partial: { title: txt(og("title") || dom.title), image: absUrl(og("image"), url), source: url } });
}

// ---- Photo reading (OCR) ----
let worker = null, onProg = null;
const warm = () => worker ||= Tesseract.createWorker("eng", 1, { logger: m => onProg && onProg(m) }).catch(e => { worker = null; throw e; });
async function prep(file) {
  const bmp = await createImageBitmap(file), k = Math.min(2, 2200 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k), cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(bmp, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h), a = d.data, hist = new Uint32Array(256);
  for (let i = 0; i < a.length; i += 4) { const g = (a[i] * .299 + a[i + 1] * .587 + a[i + 2] * .114) | 0; a[i] = g; hist[g]++; }
  const n = w * h; let lo = 0, hi = 255, acc = 0;
  while (lo < 255 && (acc += hist[lo]) < n * .02) lo++;
  acc = 0; while (hi > 0 && (acc += hist[hi]) < n * .02) hi--;
  const sc = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < a.length; i += 4) a[i] = a[i + 1] = a[i + 2] = Math.max(0, Math.min(255, (a[i] - lo) * sc));
  cx.putImageData(d, 0, 0); return cv;
}

function form(id) {
  const base = { title: "", source: "", time: "", servings: "", image: "", ingredients: [], steps: [], tags: [], notes: "" };
  const fill = (a, b) => ({ ...a, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v && (!Array.isArray(v) || v.length))) });
  if (!id) warm().catch(() => {});
  const render = (r, msg = "") => {
    app.innerHTML = `<h1 class="pg">${id ? "Edit recipe" : "Add a recipe"}</h1>
    ${id ? "" : `<div class="two quick">
      <div class="panel glass"><h3>Paste a link</h3><p class="meta">Any recipe website. It imports as soon as you paste.</p>
        <div class="row nowrap"><input id="url" type="url" placeholder="https://…" aria-label="Recipe link"><button class="btn main" id="imp">Import</button></div></div>
      <div class="panel glass drop" id="drop"><h3>Upload a photo</h3><p class="meta">Recipe card, cookbook page or screenshot. Drop it here, choose a file, or paste an image.</p>
        <label class="btn main" for="scan">Choose photo</label><input class="sr" id="scan" type="file" accept="image/*"></div></div>
      <details class="panel glass paste" id="pastebox"><summary>Paste recipe text instead</summary><p class="meta">Copy everything from a recipe page (or just the ingredients and steps) and paste it here. Garde picks out the recipe and skips the story.</p><textarea id="ptxt" placeholder="Paste here…"></textarea><div class="row" style="margin-top:16px"><button class="btn main" id="pgo">Extract recipe</button></div></details>
      <div class="prog" id="prog" hidden><span class="bar"><i></i></span><small id="pt"></small></div>`}
    <p class="status" id="st" role="status">${esc(msg)}</p>
    <div class="panel glass"><label for="title">Title</label><input id="title" value="${esc(r.title)}" required>
      <div class="two"><div><label for="time">Total time</label><input id="time" value="${esc(r.time)}" placeholder="45 min"></div><div><label for="serv">Servings</label><input id="serv" value="${esc(r.servings)}" inputmode="numeric"></div></div>
      <label for="ing">Ingredients (one per line)</label><textarea id="ing">${esc(r.ingredients.join("\n"))}</textarea>
      <label for="stp">Steps (one per line)</label><textarea id="stp">${esc(r.steps.join("\n"))}</textarea>
      <div class="two"><div><label for="tags">Tags (comma separated)</label><input id="tags" value="${esc(r.tags.join(", "))}" placeholder="dinner, vegetarian"></div><div><label for="img">Photo link</label><input id="img" value="${esc(r.image)}"></div></div>
      <label for="notes">Notes</label><textarea id="notes" style="min-height:80px">${esc(r.notes)}</textarea>
      <div class="row" style="margin-top:28px"><button class="btn main" id="save">Save recipe</button><a class="btn" href="#/dashboard">Cancel</a></div></div>`;
    const st = m => { const e = $("#st"); if (e) e.textContent = m; };
    const busy = (on, label, p) => { const b = $("#prog"); if (!b) return; b.hidden = !on; $("#pt").textContent = label || ""; b.classList.toggle("ind", p == null); b.querySelector("i").style.width = p == null ? "40%" : Math.round(p * 100) + "%"; };
    const cur = () => ({ title: $("#title").value, source: r.source, time: $("#time").value, servings: $("#serv").value, image: $("#img").value, ingredients: lines($("#ing").value), steps: lines($("#stp").value), tags: $("#tags").value.split(",").map(t => t.trim()).filter(Boolean), notes: $("#notes").value });
    if (!id) {
      const doImport = async u => {
        u = u.trim(); if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(u)) u = "https://" + u;
        if (!/^https?:\/\//i.test(u)) return st("Paste a full recipe link first.");
        busy(true, "Fetching the recipe…"); st("");
        try { const x = await importUrl(u); busy(false); render(fill(cur(), x), "Imported. Check the details, then save."); }
        catch (e) { busy(false); const m = "Some sites block automated access. Paste the recipe text below and Garde will pick out the ingredients and steps."; if (e.partial) render(fill(cur(), e.partial), "I found the title and photo but not the recipe. " + m); else st("Couldn't open that page. " + m); const b = $("#pastebox"); if (b) b.open = true; }
      };
      $("#imp").onclick = () => doImport($("#url").value);
      $("#url").onkeydown = e => { if (e.key === "Enter") doImport(e.target.value); };
      $("#pgo").onclick = () => { const t = $("#ptxt").value.trim(); if (t.length < 40) return st("Paste the recipe text first."); const p = parseText(t); if (!p.ingredients.length && !p.steps.length) return st("I couldn't find ingredients or steps in that text. Make sure it includes the ingredient list."); render(fill(cur(), p), "Recipe extracted. Check the details, then save."); };
      $("#url").onpaste = e => { const t = e.clipboardData.getData("text").trim(); if (/^https?:\/\//i.test(t)) setTimeout(() => doImport(t), 0); };
      const doScan = async f => {
        if (!f || !f.type.startsWith("image/")) return st("Choose an image file (JPG or PNG).");
        st(""); busy(true, "Preparing photo…", .03);
        try {
          const cv = await prep(f);
          onProg = m => m.status === "recognizing text" ? busy(true, "Reading text…", .1 + m.progress * .9) : busy(true, "Getting the reader ready (first time only)…");
          const { data } = await (await warm()).recognize(cv);
          onProg = null; busy(false);
          const t = data.text.split("\n").filter(l => { const s = l.trim(); return s.length > 1 && (s.match(/[a-z0-9]/gi) || []).length / s.length > .55; }).join("\n");
          const p = parseText(t);
          if (!p.ingredients.length && !p.steps.length) render(fill(cur(), { notes: t }), "I couldn't tell ingredients from steps, so the full text is in Notes. Move it where it belongs.");
          else render(fill(cur(), p), "Photo read. Check for small mistakes, then save.");
        } catch { onProg = null; busy(false); st("Couldn't read that photo. Try a sharper, brighter picture."); }
      };
      $("#scan").onchange = e => doScan(e.target.files[0]);
      const dz = $("#drop");
      dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); };
      dz.ondragleave = () => dz.classList.remove("over");
      dz.ondrop = e => { e.preventDefault(); dz.classList.remove("over"); doScan(e.dataTransfer.files[0]); };
      window.onpaste = e => { const f = [...(e.clipboardData?.files || [])][0]; if (f && $("#drop")) doScan(f); };
    }
    $("#save").onclick = async () => {
      const d = cur(); if (!d.title.trim()) { toast("Add a title first"); return; }
      try {
        if (id) await updateDoc(doc(db, "users", user.uid, "recipes", id), d);
        else { if (!isReserve && (await load()).length >= FREE_LIMIT) { toast(`Free accounts hold ${FREE_LIMIT} recipes. Garde Reserve removes the limit.`); return; } await addDoc(col(), { ...d, favorite: false, createdAt: serverTimestamp() }); }
        recipes = null; toast("Recipe saved"); location.hash = "#/dashboard";
      } catch { toast("Couldn't save. Check your connection and try again."); }
    };
  };
  if (!id) return render(base);
  getDoc(doc(db, "users", user.uid, "recipes", id)).then(s => render({ ...base, ...s.data() }));
}

// ---- Collections, shopping list, settings ----
async function collections() {
  app.innerHTML = `<h1 class="pg">Collections</h1><p class="lead">Your recipes, grouped by tag.</p><div id="c"></div>`;
  const all = await load(), g = {};
  all.forEach(r => (r.tags?.length ? r.tags : ["Untagged"]).forEach(t => (g[t.toLowerCase()] ||= { n: t, r: [] }).r.push(r)));
  $("#c").innerHTML = all.length ? Object.values(g).sort((a, b) => b.r.length - a.r.length).map(x => `<div class="sect"><h3>${esc(x.n)} <small class="meta">${x.r.length}</small></h3><div class="grid">${x.r.map(r => `<a class="rc glass" href="#/recipe/${r.id}"><div class="body"><h3>${esc(r.title)}</h3><small>${esc(r.time || "")}</small></div></a>`).join("")}</div></div>`).join("")
    : `<div class="empty glass"><h3>No collections yet</h3>Add tags like "dinner" or "baking" to your recipes and they'll group here.<br><a class="btn main" href="#/add">Add recipe</a></div>`;
}

async function pantry() {
  const all = await load();
  let pick = lsGet("garde.pick", []).filter(id => all.some(r => r.id === id)), done = lsGet("garde.done", []), serv = lsGet("garde.serv", {});
  const draw = () => {
    const groups = buildList(all.filter(r => pick.includes(r.id)), serv);
    app.innerHTML = `<h1 class="pg">Pantry</h1><p class="lead">Your shopping list. Choose recipes, set how many people you're cooking for, and every ingredient is combined, scaled and sorted by aisle.</p>
    ${all.length ? `<div class="detail"><div class="panel glass"><h3>Recipes</h3><ul class="tick">${all.map(r => { const base = parseInt(r.servings) || 0, cur = serv[r.id] || base;
      return `<li class="prow"><label><input type="checkbox" data-r="${r.id}" ${pick.includes(r.id) ? "checked" : ""}><span>${esc(r.title)}</span></label>${base ? `<span class="step" data-s="${r.id}"><button aria-label="Fewer servings" data-d="-1">−</button><b>${cur}</b><button aria-label="More servings" data-d="1">+</button></span>` : ""}</li>`; }).join("")}</ul></div>
    <div class="panel glass"><div class="row" style="justify-content:space-between"><h3>To buy</h3>${done.length ? `<button class="btn" id="clr">Clear checked</button>` : ""}</div>
    ${ORDER.filter(a => groups[a]).map(a => `<div class="aisle">${a}</div><ul class="tick">${groups[a].map(e => { const id = a + "|" + e.key; return `<li><label><input type="checkbox" data-i="${esc(id)}" ${done.includes(id) ? "checked" : ""}><span>${esc(itemText(e))}</span></label></li>`; }).join("")}</ul>`).join("") || `<p class="meta">Select a recipe to build your list.</p>`}</div></div>`
    : `<div class="empty glass"><h3>Your Pantry is empty</h3>Add a recipe and it will show up here.<br><a class="btn main" href="#/add">Add recipe</a></div>`}`;
    app.querySelectorAll("[data-r]").forEach(c => c.onchange = () => { pick = c.checked ? [...pick, c.dataset.r] : pick.filter(x => x !== c.dataset.r); lsSet("garde.pick", pick); draw(); });
    app.querySelectorAll("[data-i]").forEach(c => c.onchange = () => { const i = c.dataset.i; done = c.checked ? [...done, i] : done.filter(x => x !== i); lsSet("garde.done", done); draw(); });
    app.querySelectorAll("[data-s] button").forEach(b => b.onclick = () => { const id = b.parentElement.dataset.s, r = all.find(x => x.id === id), base = parseInt(r.servings) || 1; serv[id] = Math.max(1, Math.min(99, (serv[id] || base) + +b.dataset.d)); lsSet("garde.serv", serv); draw(); });
    if ($("#clr")) $("#clr").onclick = () => { done = []; lsSet("garde.done", done); draw(); };
  };
  draw();
}

function settings() {
  app.innerHTML = `<h1 class="pg">Settings</h1><div class="panel glass"><h3>Account</h3><p class="meta">${esc(user.displayName || "")}<br>${esc(user.email || "")}<br>Account ID: <code>${esc(user.uid)}</code></p><div class="row" style="margin-top:22px"><button class="btn" id="out2">Sign out</button></div></div>
  <div class="panel glass"><h3>Plan</h3><p class="meta">${isReserve ? '<span class="badge">GARDE RESERVE</span>' : "Free plan"}${isStaff ? ' · <span class="badge">STAFF</span>' : ""}</p><div class="row" style="margin-top:22px"><a class="btn" href="#/reserve">${isReserve ? "Manage" : "See Garde Reserve"}</a></div></div>
  <div class="panel glass"><h3>Your data</h3><p class="meta">Download every recipe as a JSON file.</p><div class="row" style="margin-top:22px"><button class="btn main" id="exp">Export recipes</button></div></div>`;
  $("#out2").onclick = () => signOut(auth).then(() => location.hash = "#/");
  $("#exp").onclick = async () => {
    const all = (await load()).map(({ createdAt, ...r }) => r);
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([JSON.stringify(all, null, 2)], { type: "application/json" })), download: "garde-recipes.json" });
    a.click(); toast("Export downloaded");
  };
}

// ---- Support tickets, staff page, Garde Reserve ----
const CATS = ["Account", "Recipes", "Importing", "Photo upload", "Garde Reserve", "Other"];
const when = ts => { const d = ts?.toDate?.(); return d ? d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "just now"; };
const stPill = s => `<span class="st ${s}">${s[0].toUpperCase() + s.slice(1)}</span>`;

async function createTicket(subject, category, text) {
  const now = serverTimestamp();
  const t = await addDoc(collection(db, "tickets"), { uid: user.uid, email: user.email || "", name: user.displayName || "", subject, category, status: "open", priority: isReserve, lastFrom: "user", createdAt: now, updatedAt: now });
  await addDoc(collection(db, "tickets", t.id, "messages"), { from: "user", uid: user.uid, name: user.displayName || "You", text, createdAt: now });
  return t.id;
}

async function support() {
  if (!user) { app.innerHTML = `<div class="center glass"><h2>Support</h2><p>Sign in to open a ticket and follow replies from our team.</p><a class="btn main" href="#/login">Sign in</a></div>`; return; }
  app.innerHTML = `<h1 class="pg">Support</h1><p class="lead">Tell us what's going on and our team will reply in your ticket.${isReserve ? " As a Reserve member, you're at the front of the line." : ""}</p>
  <div class="detail"><div class="panel glass"><h3>New ticket</h3>
    <label for="cat">Topic</label><select id="cat">${CATS.map(c => `<option>${c}</option>`).join("")}</select>
    <label for="sub">Subject</label><input id="sub" maxlength="120">
    <label for="msg">Message</label><textarea id="msg" maxlength="4000" placeholder="What happened, and what did you expect? For import problems, include the link."></textarea>
    <div class="row" style="margin-top:24px"><button class="btn main" id="send">Send ticket</button></div></div>
  <div><h3 style="margin-bottom:16px">Your tickets</h3><div id="mine"><p class="meta">Loading…</p></div></div></div>`;
  $("#send").onclick = async e => {
    const sub = $("#sub").value.trim(), msg = $("#msg").value.trim();
    if (!sub || !msg) return toast("Add a subject and a message");
    e.target.disabled = true;
    try { const id = await createTicket(sub, $("#cat").value, msg); toast("Ticket sent"); location.hash = "#/ticket/" + id; }
    catch { e.target.disabled = false; toast("Couldn't send. Please try again."); }
  };
  try {
    const snap = await getDocs(query(collection(db, "tickets"), where("uid", "==", user.uid)));
    const ts = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
    $("#mine").innerHTML = ts.length ? ts.map(t => `<a class="trow glass" href="#/ticket/${t.id}"><b>${esc(t.subject)}</b>${stPill(t.status)}<small>${esc(t.category)} · ${when(t.updatedAt)}</small></a>`).join("") : `<div class="empty glass"><h3>No tickets yet</h3>When you open one, it shows up here.</div>`;
  } catch { $("#mine").innerHTML = `<p class="meta">Couldn't load your tickets.</p>`; }
}

function ticket(id) {
  app.innerHTML = `<p class="meta">Loading…</p>`;
  let t = null, msgs = [], has = null;
  const draw = () => {
    if (!t) return;
    const mine = t.uid === user.uid, staff = isStaff && !mine;
    const keep = $("#rep")?.value || "", focus = document.activeElement?.id === "rep";
    app.innerHTML = `<a class="meta" href="#/${staff ? "staff" : "support"}">← Back</a>
    <div class="row" style="justify-content:space-between;margin:16px 0 6px"><h1 class="pg" style="margin:0">${esc(t.subject)}</h1><div>${t.priority ? '<span class="badge">RESERVE</span> ' : ""}${stPill(t.status)}</div></div>
    <p class="meta">${esc(t.category)} · Opened ${when(t.createdAt)}${staff ? ` · ${esc(t.name)} (${esc(t.email)})` : ""}</p>
    <div class="thread" aria-live="polite">${msgs.map(m => `<div class="msg ${m.from === "staff" ? "staff" : "user"}"><small>${m.from === "staff" ? "Garde team" : esc(m.name || "You")} · ${when(m.createdAt)}</small>${esc(m.text)}</div>`).join("")}</div>
    <div class="panel glass"><label for="rep">${t.status === "closed" ? "This ticket is closed. Replying will reopen it." : "Reply"}</label><textarea id="rep" maxlength="4000"></textarea>
      <div class="row" style="margin-top:20px"><button class="btn main" id="go">Send reply</button>
      ${staff ? `<select id="sts" style="width:auto" aria-label="Status">${["open", "pending", "closed"].map(s => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}</select><button class="btn" id="rsv">${has ? "Revoke" : "Grant"} Garde Reserve</button>` : t.status === "closed" ? "" : `<button class="btn" id="cls">Close ticket</button>`}</div></div>`;
    $("#rep").value = keep; if (focus) $("#rep").focus();
    $("#go").onclick = async () => {
      const text = $("#rep").value.trim(); if (!text) return;
      const now = serverTimestamp(); $("#go").disabled = true;
      try {
        await addDoc(collection(db, "tickets", id, "messages"), { from: staff ? "staff" : "user", uid: user.uid, name: user.displayName || "", text, createdAt: now });
        await updateDoc(doc(db, "tickets", id), { status: staff ? (t.status === "open" ? "pending" : t.status) : "open", lastFrom: staff ? "staff" : "user", updatedAt: now });
      } catch { toast("Couldn't send your reply."); $("#go").disabled = false; }
    };
    const setStatus = s => updateDoc(doc(db, "tickets", id), { status: s, updatedAt: serverTimestamp() }).catch(() => toast("Couldn't update the ticket."));
    if ($("#sts")) $("#sts").onchange = e => setStatus(e.target.value);
    if ($("#cls")) $("#cls").onclick = () => setStatus("closed");
    if ($("#rsv")) $("#rsv").onclick = async () => {
      const ref = doc(db, "reserve", t.uid);
      try { if (has) await deleteDoc(ref); else await setDoc(ref, { since: serverTimestamp(), by: user.uid }); has = !has; toast(has ? "Reserve granted" : "Reserve revoked"); draw(); }
      catch { toast("Couldn't update Reserve."); }
    };
  };
  const u1 = onSnapshot(doc(db, "tickets", id), async s => {
    if (!s.exists()) { app.innerHTML = `<div class="empty glass"><h3>Ticket not found</h3><a class="btn" href="#/support">Back to support</a></div>`; return; }
    t = { id, ...s.data() };
    if (isStaff && t.uid !== user.uid && has === null) has = !!(await getDoc(doc(db, "reserve", t.uid)).catch(() => null))?.exists();
    draw();
  }, () => { app.innerHTML = `<div class="empty glass"><h3>No access</h3>You can only open your own tickets.<br><a class="btn" href="#/support">Back to support</a></div>`; });
  const u2 = onSnapshot(query(collection(db, "tickets", id, "messages"), orderBy("createdAt")), s => { msgs = s.docs.map(d => d.data()); draw(); }, () => {});
  unsub = () => { u1(); u2(); };
}

function staff(tab) {
  if (!isStaff) { app.innerHTML = `<div class="empty glass"><h3>Staff only</h3>This page is for authorised Garde accounts.<br><a class="btn" href="#/dashboard">Back to my recipes</a></div>`; return; }
  if (tab === "members") return members();
  let all = [], f = "open", q = "";
  app.innerHTML = `<h1 class="pg">Staff</h1><div class="bar" style="margin-top:0"><a class="chip" href="#/staff" aria-pressed="true">Tickets</a><a class="chip" href="#/staff/members" aria-pressed="false">Members</a></div><p class="lead">Every support ticket, newest activity first. Reserve members are pinned to the top.</p><div class="stats" id="stats"></div>
  <div class="bar"><input id="q" type="search" placeholder="Search subject, name or email" aria-label="Search tickets">${["open", "pending", "closed", "all"].map(x => `<button class="chip" data-f="${x}" aria-pressed="${x === f}">${x[0].toUpperCase() + x.slice(1)}</button>`).join("")}</div><div id="tl"></div>`;
  const draw = () => {
    const n = s => all.filter(t => t.status === s).length;
    $("#stats").innerHTML = ["open", "pending", "closed"].map(s => `<div class="glass"><b>${n(s)}</b>${s[0].toUpperCase() + s.slice(1)}</div>`).join("");
    const list = all.filter(t => (f === "all" || t.status === f) && `${t.subject} ${t.name} ${t.email}`.toLowerCase().includes(q)).sort((a, b) => (b.priority - a.priority) || ((b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)));
    $("#tl").innerHTML = list.length ? list.map(t => `<a class="trow glass" href="#/ticket/${t.id}"><b>${t.priority ? '<span class="badge">RESERVE</span> ' : ""}${esc(t.subject)}</b>${stPill(t.status)}<small>${esc(t.name || t.email)} · ${esc(t.category)} · ${when(t.updatedAt)}${t.lastFrom === "user" && t.status !== "closed" ? " · awaiting reply" : ""}</small></a>`).join("") : `<div class="empty glass"><h3>Nothing here</h3>No tickets match this view.</div>`;
  };
  $("#q").oninput = e => { q = e.target.value.toLowerCase(); draw(); };
  app.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { f = b.dataset.f; app.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); });
  unsub = onSnapshot(collection(db, "tickets"), s => { all = s.docs.map(d => ({ id: d.id, ...d.data() })); draw(); }, () => toast("Couldn't load tickets. Check your Firestore rules."));
}

function reserve() {
  const perks = [["Unlimited recipes", `Free accounts hold ${FREE_LIMIT} recipes. Reserve has no limit.`], ["Sous meal planner", "Search the recipe library for your week. Every pick is saved to your recipes and its ingredients land in your Pantry."], ["Priority support", "Your tickets are pinned to the top of our queue."]];
  app.innerHTML = `<section class="band" style="margin-top:0"><div><span class="badge" style="background:#fff;color:#0a0a0a">$9.99 / MONTH</span><h1 style="margin:18px 0 .3em">Garde Reserve</h1><p class="lead" style="color:#bdbdbd">For people who cook a lot and want their recipe collection to keep up.</p><div class="row" id="cta"></div></div>
    <ul>${perks.map(([h]) => `<li>${h}</li>`).join("")}<li>Reserve badge on your account</li></ul></section>
    <div class="grid3">${perks.map(([h, p]) => `<div class="glass"><h3>${h}</h3><p>${p}</p></div>`).join("")}</div>
    <p class="meta" style="text-align:center;margin-top:36px">Reserve is rolling out now. Request access and our team will set you up in your ticket.</p>`;
  const cta = $("#cta");
  if (!user) cta.innerHTML = `<a class="btn main big" href="#/login">Sign in to request access</a>`;
  else if (isReserve) cta.innerHTML = `<span class="badge" style="background:#fff;color:#0a0a0a">YOU'RE A RESERVE MEMBER</span><a class="btn" href="#/sous">Open Sous</a><a class="btn" href="#/support">Priority support</a>`;
  else { cta.innerHTML = `<button class="btn main big" id="req">Request access</button>`; $("#req").onclick = async e => { e.target.disabled = true; try { location.hash = "#/ticket/" + await createTicket("Garde Reserve access request", "Garde Reserve", "I'd like to request access to Garde Reserve."); } catch { e.target.disabled = false; toast("Couldn't send your request."); } }; }
}

// ---- Sous (Reserve meal planner) ----
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

async function sous() {
  if (!isReserve) { app.innerHTML = `<div class="center glass"><span class="badge">GARDE RESERVE</span><h2 style="margin-top:18px">Meet Sous</h2><p>Your meal planner. Choose recipes from the library and Garde saves them to your recipes and puts every ingredient on your shopping list.</p><a class="btn main" href="#/reserve">See Garde Reserve</a></div>`; return; }
  app.innerHTML = `<h1 class="pg">Sous</h1><p class="lead">Choose what you're cooking. Each pick is saved to your recipes, and its ingredients go straight into your Pantry.</p>
    <div class="bar"><input id="sq" type="search" placeholder="Search the library by recipe, ingredient or tag" aria-label="Search the recipe library"><span class="meta" id="cnt"></span><a class="btn" href="#/pantry">Open Pantry</a></div><div class="bar" id="chips" style="margin-top:0"></div><div class="grid" id="lib"></div>`;
  let all; try { all = await load(); } catch { app.innerHTML = `<div class="empty glass"><h3>Couldn't load your recipes</h3>Check your connection and refresh.</div>`; return; }
  let pick = lsGet("garde.pick", []), tag = "All", q = "";
  const mine = lib => all.find(r => r.sousId === lib.id);
  const inPlan = lib => { const r = mine(lib); return !!r && pick.includes(r.id); };
  const tags = ["All", ...new Set(LIBRARY.flatMap(r => r.tags))];
  const toggle = async lib => {
    let r = mine(lib);
    if (r && pick.includes(r.id)) pick = pick.filter(x => x !== r.id);
    else {
      if (!r) {
        const d = { title: lib.title, source: "", time: lib.time, servings: String(lib.servings), image: "", ingredients: lib.ingredients, steps: lib.steps, tags: [...lib.tags, "Sous"], notes: "", favorite: false, sousId: lib.id, createdAt: serverTimestamp() };
        try { const ref = await addDoc(col(), d); r = { id: ref.id, ...d }; all = [r, ...all]; recipes = null; } catch { return toast("Couldn't add that recipe. Try again."); }
      }
      pick = [...pick, r.id]; toast("Added to your recipes and Pantry");
    }
    lsSet("garde.pick", pick); draw();
  };
  const draw = () => {
    $("#cnt").textContent = `${LIBRARY.filter(inPlan).length} in your plan`;
    $("#chips").innerHTML = tags.map(t => `<button class="chip" data-t="${esc(t)}" aria-pressed="${t === tag}">${esc(t)}</button>`).join("");
    $("#lib").innerHTML = LIBRARY.filter(r => (tag === "All" || r.tags.includes(tag)) && `${r.title} ${r.tags.join(" ")} ${r.ingredients.join(" ")}`.toLowerCase().includes(q)).map(r => `<div class="glass panel sc"><small class="meta">${esc(r.time)} · ${r.servings} servings</small><h3>${esc(r.title)}</h3>
      <details><summary class="meta">${r.ingredients.length} ingredients</summary><ul>${r.ingredients.map(i => `<li>${esc(i)}</li>`).join("")}</ul></details>
      <button class="btn ${inPlan(r) ? "" : "main"}" data-id="${r.id}">${inPlan(r) ? "✓ In your plan · Remove" : "Add to plan"}</button></div>`).join("");
    app.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { tag = b.dataset.t; draw(); });
    app.querySelectorAll("[data-id]").forEach(b => b.onclick = () => { b.disabled = true; toggle(LIBRARY.find(x => x.id === b.dataset.id)); });
  };
  draw();
  $("#sq").oninput = e => { q = e.target.value.toLowerCase(); draw(); };
}

// ---- Staff: members and Reserve access ----
function members() {
  app.innerHTML = `<h1 class="pg">Staff</h1><div class="bar" style="margin-top:0"><a class="chip" href="#/staff" aria-pressed="false">Tickets</a><a class="chip" href="#/staff/members" aria-pressed="true">Members</a></div>
  <p class="lead">Everyone who has signed in. Grant or revoke Garde Reserve here.</p>
  <div class="bar"><input id="mq" type="search" placeholder="Search by name or email" aria-label="Search members"><button class="chip" id="ro" aria-pressed="false">Reserve only</button></div><div id="ml"></div>
  <div class="panel glass" style="margin-top:28px"><h3>Add by account ID</h3><p class="meta">For someone who hasn't signed in since this page was added. They can copy their ID from Settings, or you can find it in Firebase under Authentication.</p>
  <div class="row nowrap" style="margin-top:16px"><input id="uid" placeholder="Account ID" aria-label="Account ID"><button class="btn main" id="gu">Grant Reserve</button></div></div>`;
  let all = [], rs = new Set(), q = "", only = false;
  const setR = async (uid, on) => {
    try { if (on) await setDoc(doc(db, "reserve", uid), { since: serverTimestamp(), by: user.uid }); else await deleteDoc(doc(db, "reserve", uid)); toast(on ? "Reserve granted" : "Reserve revoked"); }
    catch { toast("Couldn't update. Check your Firestore rules."); }
  };
  const draw = () => {
    const list = all.filter(m => (!only || rs.has(m.id)) && `${m.name} ${m.email}`.toLowerCase().includes(q)).sort((a, b) => (b.lastSeen?.seconds || 0) - (a.lastSeen?.seconds || 0));
    $("#ml").innerHTML = list.length ? list.map(m => `<div class="trow glass"><b>${esc(m.name || m.email)} ${rs.has(m.id) ? '<span class="badge">RESERVE</span>' : ""}</b><button class="btn ${rs.has(m.id) ? "" : "main"}" data-u="${esc(m.id)}">${rs.has(m.id) ? "Revoke" : "Grant Reserve"}</button><small>${esc(m.email)} · last seen ${when(m.lastSeen)}</small></div>`).join("") : `<div class="empty glass"><h3>No members found</h3>People appear here after they sign in to Garde.</div>`;
    app.querySelectorAll("[data-u]").forEach(b => b.onclick = () => setR(b.dataset.u, !rs.has(b.dataset.u)));
  };
  $("#mq").oninput = e => { q = e.target.value.toLowerCase(); draw(); };
  $("#ro").onclick = e => { only = !only; e.target.setAttribute("aria-pressed", only); draw(); };
  $("#gu").onclick = () => { const v = $("#uid").value.trim(); if (v.length < 10) return toast("Paste a full account ID"); setR(v, true); $("#uid").value = ""; };
  const u1 = onSnapshot(collection(db, "profiles"), x => { all = x.docs.map(d => ({ id: d.id, ...d.data() })); draw(); }, () => toast("Couldn't load members. Publish the updated Firestore rules."));
  const u2 = onSnapshot(collection(db, "reserve"), x => { rs = new Set(x.docs.map(d => d.id)); draw(); }, () => {});
  unsub = () => { u1(); u2(); };
}
