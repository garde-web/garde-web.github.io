import * as pg from "./pages.js";
import { LIBRARY } from "./library.js";
import { scaleLine, buildList, itemText, ORDER } from "./scale.js";
import { extractRecipe, bookmarklet } from "./extract.js";
import { mountSupport } from "./support.js";
import { mountSous, weekEntries } from "./sous.js";
import * as fb from "./firebase-config.js";
import { onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, doc, getDoc, getDocs, updateDoc, deleteDoc, query, orderBy, where, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const { auth, db, provider } = fb, IMPORT_PROXY = fb.IMPORT_PROXY || ""; // IMPORT_PROXY is optional in firebase-config.js

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lines = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);
const app = $("#app");
let user = null, ready = false, recipes = null, isStaff = false, isAdmin = false, isReserve = false, unsub = null;
const badges = { support: 0, staff: 0 };
const FREE_LIMIT = 50;

const toast = m => { const t = $("#toast"); t.textContent = m; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 2600); };
const col = () => collection(db, "users", user.uid, "recipes");

let stopReserve = null, stopBadges = null;
const reserveOn = d => d.exists() && !(d.data().until > 0 && d.data().until < Date.now());
onAuthStateChanged(auth, async u => {
  stopReserve?.(); stopBadges?.(); stopReserve = stopBadges = null;
  user = u; isStaff = isAdmin = isReserve = false; recipes = null; badges.support = badges.staff = 0;
  if (u) {
    setDoc(doc(db, "profiles", u.uid), { name: u.displayName || "", email: u.email || "", photo: u.photoURL || "", lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    const [a, b] = await Promise.all([getDoc(doc(db, "staff", u.uid)).catch(() => null), getDoc(doc(db, "reserve", u.uid)).catch(() => null)]);
    isStaff = !!a?.exists(); isAdmin = isStaff && a.data().role === "admin"; isReserve = !!b && reserveOn(b);
    stopReserve = onSnapshot(doc(db, "reserve", u.uid), x => { const v = reserveOn(x); if (v !== isReserve) { isReserve = v; if (v) toast("Garde Reserve is now active"); route(); } }, () => {});
    stopBadges = onSnapshot(isStaff ? collection(db, "tickets") : query(collection(db, "tickets"), where("uid", "==", u.uid)), x => {
      const ts = x.docs.map(d => d.data());
      badges.support = ts.filter(t => t.uid === u.uid && t.unread).length; badges.staff = isStaff ? ts.filter(t => t.status === "open" && t.uid !== u.uid).length : 0;
      if (ready) nav();
    }, () => {});
  }
  ready = true; route();
});
window.addEventListener("hashchange", route);

async function login() {
  try { await signInWithPopup(auth, provider); let seed = ""; try { seed = sessionStorage.getItem("garde.seed"); } catch {} location.hash = seed ? "#/add" : "#/dashboard"; }
  catch (e) { toast("Sign-in didn't finish. Try again."); }
}

function nav() {
  const h = location.hash || "#/";
  const l = (href, label, n = 0) => `<a class="l" href="${href}" ${h === href || h.startsWith(href + "/") ? "aria-current=page" : ""}>${label}${n ? `<span class="navbadge">${n}</span>` : ""}</a>`;
  const lh = (href, label) => l(href, label).replace('class="l"', 'class="l hide"');
  $("#nav").innerHTML = `<a class="logo" href="#/">Garde</a>` + (user
    ? `${l("#/dashboard", "Recipes")}${l("#/collections", "Collections")}${l("#/sous", "Sous")}${l("#/pantry", "Pantry")}${l("#/add", "Add")}${l("#/support", "Support", badges.support)}${l("#/reserve", "Reserve")}${isStaff ? l("#/staff", "Staff", badges.staff) : ""}<a href="#/settings" aria-label="Settings"><img class="avatar" src="${esc(user.photoURL || "")}" alt="" referrerpolicy="no-referrer"></a>`
    : `${l("#/", "Home")}${lh("#/features", "Features")}${lh("#/reserve", "Reserve")}${lh("#/support", "Support")}${lh("#/about", "About")}<a class="btn main" href="#/login">Sign in</a>`);
  $("#foot").innerHTML = pg.footer();
  const o = $("#out"); if (o) o.onclick = () => signOut(auth).then(() => location.hash = "#/");
}

async function route() {
  if (!ready) return;
  nav();
  unsub?.(); unsub = null;
  const [, page, id] = (location.hash || "#/").split("/");
  if (page === "import") { try { sessionStorage.setItem("garde.seed", id || ""); } catch {} location.hash = user ? "#/add" : "#/login"; return; }
  const guarded = ["dashboard", "add", "recipe", "edit", "collections", "pantry", "shopping", "settings", "ticket", "staff", "sous"];
  if (guarded.includes(page) && !user) { location.hash = "#/login"; return; }
  if (page === "login" && user) { location.hash = "#/dashboard"; return; }
  ({ "": home, login: loginView, dashboard, add: () => form(), recipe: () => detail(id), edit: () => form(id), features: stat("features"), about: stat("about"), collections, pantry, shopping: pantry, settings, support: () => P.support(), ticket: () => P.ticket(id), staff: () => P.staff(id), reserve: () => P.reserve(), sous: () => S.sous() }[page] || home)();
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

function fromText(md, url) {
  const title = (/^Title:\s*(.+)$/m.exec(md) || [])[1] || "";
  const p = parseText(md.replace(/^(Title|URL Source|Markdown Content|Published Time):.*$/gm, ""));
  if (p.ingredients.length < 2 || !p.steps.length) return null;
  const img = [...md.matchAll(/!\[[^\]]*\]\((https?:[^)\s]+)\)/g)].map(m => m[1]).find(u => /\.(jpe?g|png|webp)/i.test(u) && !/logo|icon|avatar|sprite|badge/i.test(u));
  return { ...p, title: txt(title.split(/\s[|–-]\s/)[0]) || p.title, source: url, image: img || "" };
}

async function importUrl(url) {
  let seen = "";
  const fromPage = h => { seen ||= h; return extractRecipe(new DOMParser().parseFromString(h, "text/html"), url) || Promise.reject(); };
  const html = PROXIES.map(p => grab(p(url)).then(fromPage));
  // The text-reader fallback only starts if the page routes are slow or have all failed
  const reader = Promise.race([new Promise(r => setTimeout(r, 3500)), Promise.allSettled(html)]).then(() => grab("https://r.jina.ai/" + url, 25000)).then(m => fromText(m, url) || Promise.reject());
  try { return await Promise.any([...html, reader]); } catch {}
  if (!seen) throw new Error("fetch");
  const dom = new DOMParser().parseFromString(seen, "text/html"), og = k => dom.querySelector(`meta[property="og:${k}"]`)?.content || "";
  throw Object.assign(new Error("norecipe"), { partial: { title: txt(og("title") || dom.title), image: absUrl(og("image"), url), source: url } });
}

const takeSeed = () => {
  try {
    const v = sessionStorage.getItem("garde.seed"); sessionStorage.removeItem("garde.seed"); if (!v) return null;
    const j = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))));
    const str = (x, n) => typeof x === "string" ? x.slice(0, n) : "", arr = x => Array.isArray(x) ? x.filter(i => typeof i === "string").slice(0, 80).map(i => i.slice(0, 600)) : [];
    return { title: str(j.title, 200), source: str(j.source, 600), time: str(j.time, 40), servings: str(j.servings, 6), image: str(j.image, 800), ingredients: arr(j.ingredients), steps: arr(j.steps), tags: arr(j.tags).slice(0, 6) };
  } catch { return null; }
};

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
  const seed = id ? null : takeSeed();
  if (!id) warm().catch(() => {});
  const render = (r, msg = "") => {
    app.innerHTML = `<h1 class="pg">${id ? "Edit recipe" : "Add a recipe"}</h1>
    ${id ? "" : `<div class="two quick">
      <div class="panel glass"><h3>Paste a link</h3><p class="meta">Any recipe website. It imports as soon as you paste.</p>
        <div class="row nowrap"><input id="url" type="url" placeholder="https://…" aria-label="Recipe link"><button class="btn main" id="imp">Import</button></div></div>
      <div class="panel glass drop" id="drop"><h3>Upload a photo</h3><p class="meta">Recipe card, cookbook page or screenshot. Drop it here, choose a file, or paste an image.</p>
        <label class="btn main" for="scan">Choose photo</label><input class="sr" id="scan" type="file" accept="image/*"></div></div>
      <details class="panel glass paste" id="pastebox"><summary>Paste recipe text instead</summary><p class="meta">Copy everything from a recipe page (or just the ingredients and steps) and paste it here. Garde picks out the recipe and skips the story.</p><textarea id="ptxt" placeholder="Paste here…"></textarea><div class="row" style="margin-top:16px"><button class="btn main" id="pgo">Extract recipe</button></div></details>
      <details class="panel glass paste" id="bm"><summary>Save from any website with one click</summary><p class="meta">Drag this button to your bookmarks bar. On any recipe page, click it and the recipe opens here, ready to save. It works on sites that block automatic import.</p><a class="btn main" id="bml" href="#" style="margin-top:6px">Save to Garde</a></details>
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
        catch (e) { busy(false); const m = "Some sites block automatic import. Use the "Save to Garde" button below, or paste the recipe text and Garde will pick out the ingredients and steps."; if (e.partial) render(fill(cur(), e.partial), "I found the title and photo but not the recipe. " + m); else st("Couldn't open that page. " + m); const b = $("#bm"); if (b) b.open = true; }
      };
      $("#imp").onclick = () => doImport($("#url").value);
      $("#url").onkeydown = e => { if (e.key === "Enter") doImport(e.target.value); };
      $("#bml").href = bookmarklet(location.origin + location.pathname); $("#bml").onclick = e => { e.preventDefault(); toast("Drag this button up to your bookmarks bar"); };
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
  if (!id) { let host = ""; try { host = new URL(seed.source).hostname.replace(/^www\./, ""); } catch {} return render(seed ? fill(base, seed) : base, seed ? "Imported" + (host ? " from " + host : "") + ". Check the details, then save." : ""); }
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
  const plan = isReserve ? await weekEntries(ctx).catch(() => []) : [];
  const planServ = {}; plan.forEach(e => { planServ[e.rid] = (planServ[e.rid] || 0) + (e.servings || 0); });
  let pick = lsGet("garde.pick", []).filter(id => all.some(r => r.id === id)), done = lsGet("garde.done", []), serv = lsGet("garde.serv", {});
  const planned = all.filter(r => planServ[r.id]);
  const draw = () => {
    const groups = buildList(all.filter(r => pick.includes(r.id) || planServ[r.id]), { ...serv, ...planServ });
    const row = r => { const base = parseInt(r.servings) || 0, cur = serv[r.id] || base;
      return `<li class="prow"><label><input type="checkbox" data-r="${r.id}" ${pick.includes(r.id) ? "checked" : ""}><span>${esc(r.title)}</span></label>${base ? `<span class="step" data-s="${r.id}"><button aria-label="Fewer servings" data-d="-1">−</button><b>${cur}</b><button aria-label="More servings" data-d="1">+</button></span>` : ""}</li>`; };
    app.innerHTML = `<h1 class="pg">Pantry</h1><p class="lead">Your shopping list. Choose recipes, set how many people you're cooking for, and every ingredient is combined, scaled and sorted by aisle.</p>
    ${all.length ? `<div class="detail"><div>
      ${planned.length ? `<div class="panel glass"><h3>This week's plan</h3><ul class="tick">${planned.map(r => `<li class="prow"><a href="#/recipe/${r.id}">${esc(r.title)}</a><small class="meta">${planServ[r.id]} servings</small></li>`).join("")}</ul><a class="btn" href="#/sous" style="margin-top:16px">Edit plan in Sous</a></div>` : ""}
      <div class="panel glass"><h3>Recipes</h3><ul class="tick">${all.filter(r => !planServ[r.id]).map(row).join("")}</ul></div></div>
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

// ---- Shared helpers and feature modules ----
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const loadBanner = async () => {
  try { const x = await getDoc(doc(db, "config", "banner")), d = x.exists() ? x.data() : null; $("#banner").innerHTML = d && d.on && d.text ? `<div class="banner">${esc(d.text)}</div>` : ""; } catch {}
};
const ctx = { db, app, $, esc, toast, FREE_LIMIT, load, col, lsGet, lsSet, importUrl, refreshBanner: loadBanner, invalidate: () => { recipes = null; }, setUnsub: f => { unsub = f; },
  get user() { return user; }, get isStaff() { return isStaff; }, get isAdmin() { return isAdmin; }, get isReserve() { return isReserve; } };
const P = mountSupport(ctx), S = mountSous(ctx);
loadBanner();
