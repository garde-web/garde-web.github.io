// Garde: boot, sign-in, routing and the recipe screens. Page markup lives in the .html files; styling in style.css.
import * as fb from "./firebase-config.js";
import { view, fill, esc, faqItems } from "./tpl.js";
import { scaleLine, convertLine, convertText, buildList, itemText, normName, ORDER } from "./scale.js";
import { resizeImage, thumbOf } from "./photos.js";
import { mountCook } from "./cook.js";
import { mountExtras } from "./extras.js";
import { mountStatus } from "./status.js";
import { mountNews } from "./news.js";
import { extractRecipe, bookmarklet, recipeTools } from "./extract.js";
import { mountSupport } from "./support.js";
import { mountSous, weekEntries } from "./sous.js";
import { onAuthStateChanged, signInWithPopup, signOut, reauthenticateWithPopup, deleteUser } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, doc, getDoc, getDocs, updateDoc, deleteDoc, query, orderBy, where, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const { auth, db, provider } = fb, IMPORT_PROXY = fb.IMPORT_PROXY || ""; // IMPORT_PROXY is optional in firebase-config.js

// A recipe link shared from a phone to the installed app arrives as ?url=... (see share_target in manifest.webmanifest)
try {
  const q = new URLSearchParams(location.search), m = [q.get("url"), q.get("text"), q.get("title")].filter(Boolean).join(" ").match(/https?:\/\/[^\s"<>]+/);
  if (m) { sessionStorage.setItem("garde.shareurl", m[0]); history.replaceState(null, "", location.pathname + "#/add"); }
} catch {}

const $ = (s, r = document) => r.querySelector(s);
const lines = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);
const app = $("#app");
const show = (spec, data) => fill(app, spec, data);
let user = null, ready = false, recipes = null, isStaff = false, isAdmin = false, isReserve = false, unsub = null;
const badges = { support: 0, staff: 0 };
const FREE_LIMIT = 50;

const toast = m => { const t = $("#toast"); t.textContent = m; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 2600); };
const col = () => collection(db, "users", user.uid, "recipes");

let stopReserve = null, stopBadges = null;
const reserveOn = d => d.exists() && !(d.data().until > 0 && d.data().until < Date.now());
onAuthStateChanged(auth, async u => {
  stopReserve?.(); stopBadges?.(); stopReserve = stopBadges = null;
  user = u; isStaff = isAdmin = isReserve = false; recipes = null; have = null; badges.support = badges.staff = 0;
  if (u) {
    getDoc(doc(db, "profiles", u.uid)).then(p => setDoc(doc(db, "profiles", u.uid), { name: u.displayName || "", email: u.email || "", photo: u.photoURL || "", lastSeen: serverTimestamp(), ...(p.exists() ? {} : { since: serverTimestamp() }) }, { merge: true })).catch(() => {});
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
  try { await signInWithPopup(auth, provider); let seed = ""; try { seed = sessionStorage.getItem("garde.seed") || sessionStorage.getItem("garde.shareurl"); } catch {} location.hash = seed ? "#/add" : "#/dashboard"; }
  catch (e) { toast("Sign-in didn't finish. Try again."); }
}

// ---- Navigation, footer and banner (markup in layout.html) ----
function nav() {
  const page = (location.hash || "#/").split("/")[1] || "home";
  fill($("#nav"), "layout#nav", { authed: !!user, staff: isStaff, supportBadge: badges.support, staffBadge: badges.staff, photo: user?.photoURL || "", on: { [page === "ticket" ? "support" : page]: true } }, true);
  fill($("#foot"), "layout#footer", {}, true);
}
const loadBanner = async () => {
  try { const x = await getDoc(doc(db, "config", "banner")), d = x.exists() ? x.data() : null; fill($("#banner"), "layout#banner", { text: d && d.on ? d.text : "" }, true); } catch {}
};

// ---- Routing ----
async function route() {
  if (!ready) return;
  nav();
  unsub?.(); unsub = null; document.body.classList.remove("cooking");
  const [, page, id] = (location.hash || "#/").split("/");
  if (page === "import") { try { sessionStorage.setItem("garde.seed", id || ""); } catch {} location.hash = user ? "#/add" : "#/login"; return; }
  const guarded = ["dashboard", "add", "recipe", "edit", "collections", "pantry", "shopping", "settings", "ticket", "staff", "sous", "cook", "fridge"];
  if (guarded.includes(page) && !user) { location.hash = "#/login"; return; }
  if (page === "login" && user) { location.hash = "#/dashboard"; return; }
  const pages = {
    "": () => show("home", { user: !!user, go: user ? "#/add" : "#/login" }),
    login: loginView, dashboard, add: () => form(), recipe: () => detail(id), edit: () => form(id),
    features: () => show("features"), about: () => show("about"),
    collections, pantry, shopping: pantry, settings,
    cook: () => C.cook(id), s: () => X.shared(id), fridge: () => X.fridge(), privacy: () => show("privacy"), terms: () => show("terms"),
    status: () => ST.status(), news: () => N.news(id),
    support: () => P.support(), ticket: () => P.ticket(id), staff: () => P.staff(id), reserve: () => P.reserve(), sous: () => S.sous()
  };
  await (pages[page] || pages[""])();
  window.scrollTo(0, 0);
}

async function loginView() { if (await show("login")) $("#g").onclick = login; }

async function load() {
  if (recipes) return recipes;
  const snap = await getDocs(query(col(), orderBy("createdAt", "desc")));
  return recipes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---- My recipes ----
const SORTS = { new: () => 0, cooked: (a, b) => (b.cooked || 0) - (a.cooked || 0), recent: (a, b) => (b.lastCooked || 0) - (a.lastCooked || 0), rating: (a, b) => (b.rating || 0) - (a.rating || 0), az: (a, b) => (a.title || "").localeCompare(b.title || "") };
async function dashboard() {
  await show("dashboard#loading");
  let all;
  try { all = await load(); } catch (e) { await show("dashboard#error"); return; }
  let q = "", fav = false, sort = lsGet("garde.sort", "new");
  if (!(await show("dashboard"))) return;
  $("#sort").value = SORTS[sort] ? sort : "new";
  const draw = () => {
    const f = all.filter(r => (!fav || r.favorite) && (`${r.title} ${(r.tags || []).join(" ")} ${(r.ingredients || []).join(" ")}`).toLowerCase().includes(q)).sort(SORTS[sort] || SORTS.new);
    fill($("#list"), "dashboard#list", { none: !all.length, nomatch: all.length > 0 && !f.length,
      cards: f.map(r => ({ id: r.id, letter: (r.title || "?").trim()[0] || "?", image: r.thumb || r.image, favorite: r.favorite, title: r.title,
        meta: [r.time, r.servings && r.servings + " servings"].filter(Boolean).join(" · ") || "No details yet",
        track: [r.rating ? "★".repeat(r.rating) : "", r.cooked ? `Made ${r.cooked}×` : ""].filter(Boolean).join(" · ") })) });
  };
  $("#q").oninput = e => { q = e.target.value.toLowerCase(); draw(); };
  $("#sort").onchange = e => { sort = e.target.value; lsSet("garde.sort", sort); draw(); };
  $("#fav").onclick = e => { fav = !fav; e.target.setAttribute("aria-pressed", fav); draw(); };
  draw();
}

// ---- One recipe ----
async function detail(id) {
  const ref = doc(db, "users", user.uid, "recipes", id), s = await getDoc(ref);
  if (!s.exists()) { await show("recipe#notfound"); return; }
  const r = { id, ...s.data() }, base = parseInt(r.servings) || 0;
  let units = lsGet("garde.units", "original"), cur = lsGet("garde.serv", {})[id] || base, photoData = "";
  const unitList = () => [["original", "Original"], ["metric", "Metric"], ["imperial", "US"]].map(([v, label]) => ({ v, label, on: v === units }));
  const madeInfo = () => r.cooked ? `Made ${r.cooked} time${r.cooked === 1 ? "" : "s"}${r.lastCooked ? " · last on " + new Date(r.lastCooked).toLocaleDateString() : ""}` : "You haven't marked this as made yet.";
  const ok = await show("recipe", { id, title: r.title, favorite: r.favorite, source: r.source, base, notes: r.notes, units: unitList(), madeInfo: madeInfo(),
    stars: [1, 2, 3, 4, 5].map(n => ({ n, on: n <= (r.rating || 0), plural: n > 1 })), steps: (r.steps || []).map(x => convertText(x, units)),
    meta: [r.time, r.servings && r.servings + " servings", (r.tags || []).join(", ")].filter(Boolean).join(" · ") });
  if (!ok) return;
  const showIng = () => { const k = base ? cur / base : 1; fill($("#il"), "recipe#ingredients", { items: (r.ingredients || []).map(i => convertLine(scaleLine(i, k), units)) }); if (base) $("#sv").textContent = cur; };
  const showSteps = () => fill($("#stl"), "recipe#steps", { items: (r.steps || []).map(x => convertText(x, units)) });
  $("#fv").onclick = async () => { await updateDoc(ref, { favorite: !r.favorite }); recipes = null; detail(id); };
  $("#pr").onclick = () => window.print();
  $("#del").onclick = async () => {
    if (!confirm(`Delete "${r.title}"? This can't be undone.`)) return;
    await deleteDoc(ref); deleteDoc(doc(db, "users", user.uid, "photos", id)).catch(() => {}); if (r.sharedId) deleteDoc(doc(db, "shared", r.sharedId)).catch(() => {});
    recipes = null; toast("Recipe deleted"); location.hash = "#/dashboard";
  };
  const stepTo = d => { cur = Math.max(1, Math.min(99, cur + d)); const m = lsGet("garde.serv", {}); m[id] = cur; lsSet("garde.serv", m); showIng(); };
  if (base) { $("#mn").onclick = () => stepTo(-1); $("#pl").onclick = () => stepTo(1); }
  app.querySelectorAll("[data-u]").forEach(b => b.onclick = () => { units = b.dataset.u; lsSet("garde.units", units); app.querySelectorAll("[data-u]").forEach(x => x.setAttribute("aria-pressed", x === b)); showIng(); showSteps(); });
  showIng();
  const pk = () => lsGet("garde.pick", []), paint = () => { $("#pn").textContent = pk().includes(id) ? "✓ In Pantry" : "Add to Pantry"; };
  paint(); $("#pn").onclick = () => { lsSet("garde.pick", pk().includes(id) ? pk().filter(x => x !== id) : [...pk(), id]); paint(); };
  // Made it + rating
  $("#made").onclick = async () => { r.cooked = (r.cooked || 0) + 1; r.lastCooked = Date.now(); await updateDoc(ref, { cooked: r.cooked, lastCooked: r.lastCooked }).catch(() => toast("Couldn't save that.")); recipes = null; $("#madeinfo").textContent = madeInfo(); toast("Nice! Logged."); };
  app.querySelectorAll("[data-star]").forEach(b => b.onclick = async () => {
    r.rating = +b.dataset.star === r.rating ? 0 : +b.dataset.star; await updateDoc(ref, { rating: r.rating }).catch(() => toast("Couldn't save that.")); recipes = null;
    app.querySelectorAll("[data-star]").forEach(x => x.classList.toggle("on", +x.dataset.star <= r.rating));
  });
  // Sharing
  const link = () => location.origin + location.pathname + "#/s/" + r.sharedId;
  const payload = () => ({ uid: user.uid, by: user.displayName || "", title: r.title, time: r.time || "", servings: r.servings || "", ingredients: r.ingredients || [], steps: r.steps || [], tags: r.tags || [], notes: r.notes || "", image: r.image || "", photo: photoData, createdAt: serverTimestamp() });
  const drawShare = async () => {
    if (!(await fill($("#sharebox"), "recipe#sharebox", { shared: !!r.sharedId, link: r.sharedId ? link() : "" })) || !r.sharedId) return;
    $("#scopy").onclick = async () => { try { await navigator.clipboard.writeText(link()); toast("Link copied"); } catch { $("#slink").select(); toast("Press Ctrl+C to copy"); } };
    $("#supd").onclick = () => setDoc(doc(db, "shared", r.sharedId), payload()).then(() => toast("Shared copy updated")).catch(() => toast("Couldn't update. Check your Firestore rules."));
    $("#sstop").onclick = async () => { try { await deleteDoc(doc(db, "shared", r.sharedId)); await updateDoc(ref, { sharedId: "" }); r.sharedId = ""; recipes = null; toast("No longer shared"); drawShare(); } catch { toast("Couldn't stop sharing. Try again."); } };
  };
  $("#sh").onclick = async () => {
    if (!r.sharedId) {
      const sid = Array.from(crypto.getRandomValues(new Uint8Array(9)), b => (b % 36).toString(36)).join("");
      try { await setDoc(doc(db, "shared", sid), payload()); await updateDoc(ref, { sharedId: sid }); r.sharedId = sid; recipes = null; } catch { return toast("Couldn't share. Check your Firestore rules."); }
    }
    drawShare();
  };
  if (r.sharedId) drawShare();
  // Photos (stored separately so the recipe list stays fast)
  getDoc(doc(db, "users", user.uid, "photos", id)).then(ps => {
    const d = ps.exists() ? ps.data() : {}; photoData = d.data || "";
    const src = photoData || r.image; if (src) fill($("#coverbox"), "recipe#cover", { src, title: r.title });
    if (d.scan) fill($("#scanbox"), "recipe#scan", { src: d.scan });
  }).catch(() => { if (r.image) fill($("#coverbox"), "recipe#cover", { src: r.image, title: r.title }); });
}

// ---- Import helpers ----
const txt = h => new DOMParser().parseFromString(String(h ?? ""), "text/html").body.textContent.trim();
const dur = iso => { const m = /P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(iso || ""); return m && (m[1] || m[2]) ? [m[1] && m[1] + " h", m[2] && m[2] + " min"].filter(Boolean).join(" ") : ""; };
const flat = n => !n ? [] : typeof n === "string" ? [n] : Array.isArray(n) ? n.flatMap(flat) : n.itemListElement ? flat(n.itemListElement) : n.text ? [n.text] : [];
const absUrl = (u, base) => { try { return u ? new URL(u, base).href.replace(/^http:/, "https:") : ""; } catch { return ""; } };
const PROXIES = [...(IMPORT_PROXY ? [u => IMPORT_PROXY + "?url=" + encodeURIComponent(u)] : []), u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u), u => "https://corsproxy.io/?url=" + encodeURIComponent(u), u => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u)];
const grab = async (u, ms = 12000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw 0; const x = await r.text(); if (x.length < 300) throw 0; return x; } finally { clearTimeout(t); } };

// Turns loose text (page text or OCR) into title / ingredients / steps
const QTY = /^(?:\d+(?:[.,/]\d+)?(?:\s+\d\/\d)?|[¼½¾⅓⅔⅛])\s*(?:-\s*\d+)?\s*(?:cups?|c|tbsps?|tsps?|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|liters?|cloves?|pinch|dash|cans?|sticks?|slices?|pieces?)?\b/i;
const TOOLS = recipeTools();
const ING_H = /^(?:the )?ingredients?$/i, STEP_H = /^(?:instructions?|directions?|method|steps?|preparation|procedure|how to make\b.*)$/i;
// A heading like these ends the recipe part of a page, so whatever follows (notes, comments, related posts) is never read as steps
const STOP_H = /^(?:recipe )?notes?$|^nutrition(?: facts| information)?$|^comments?\b|^reviews?\b|^equipment$|^tools$|^related\b|^you (?:may|might) also like|^more recipes|^leave a (?:comment|reply|review)|^did you make this|^about the (?:author|blogger)|^faqs?$|^frequently asked|^tips?$|^popular\b|^recent\b/i;
// Turns loose text (page text, pasted text or a photo scan) into title / ingredients / steps
function parseText(text) {
  const out = { title: "", ingredients: [], steps: [], time: "", servings: "" };
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 1);
  const hasHead = lines.some(l => /^[#*\s]*ingredients?[*:\s]*$/i.test(l));
  const secs = []; let cur = null;
  const loose = { ing: [], steps: [] };
  for (const l of lines) {
    const h = l.replace(/^[#*\s]+|[*:\s]+$/g, "");
    if (ING_H.test(h)) { cur = { k: "i", items: [] }; secs.push(cur); continue; }
    if (STEP_H.test(h) && h.length < 40) { cur = { k: "s", items: [] }; secs.push(cur); continue; }
    if ((/^#{1,6}\s/.test(l) || (h.length < 40 && STOP_H.test(h))) && (cur || hasHead)) { if (/^#{1,6}\s/.test(l) && !cur && !out.title) out.title = h; cur = null; continue; }
    if (/^#{1,6}\s/.test(l)) { if (!out.title) out.title = h; continue; }
    const sv = /(?:serves|servings?|yield|makes)\s*:?\s*(\d+)/i.exec(l); if (sv && !out.servings) out.servings = sv[1];
    const tm = /(?:total|ready in)(?:\s*time)?\s*:?\s*(\d+\s*(?:h|hr|hrs|hours?|min|minutes?)(?:\s*\d+\s*(?:min|minutes?))?)/i.exec(l); if (tm && !out.time) out.time = tm[1];
    if (cur) { cur.items.push(l); continue; }
    if (hasHead) { if (!out.title && l.length < 80 && !/^[\[(*▢☐-]/.test(l)) out.title = TOOLS.cleanStep(l) || ""; continue; }
    // No headings at all (typically a photo of a card): ingredients look like quantities, steps are the longer lines after them
    const c = TOOLS.cleanStep(l); if (!c) continue;
    if (!out.title && c.length < 70 && !QTY.test(c)) out.title = c;
    else if (QTY.test(c) && c.length < 70) loose.ing.push(l);
    else if (c.length > 25 && loose.ing.length) loose.steps.push(l);
  }
  if (secs.length) {
    // Several "Ingredients" headings can appear (menus, jump links): use the fullest one, then the first steps block after it
    const ingSecs = secs.map((s, i) => ({ i, s, items: s.k === "i" ? TOOLS.cleanIngredients(s.items) : [] })).filter(x => x.items.length);
    const bestIng = ingSecs.sort((a, b) => b.items.length - a.items.length)[0];
    if (bestIng) out.ingredients = bestIng.items;
    const stepSecs = secs.map((s, i) => ({ i, items: s.k === "s" ? TOOLS.cleanSteps(s.items) : [] })).filter(x => x.items.length);
    const after = stepSecs.filter(x => !bestIng || x.i > bestIng.i);
    out.steps = (after[0] || stepSecs[0] || { items: [] }).items;
  } else {
    out.ingredients = TOOLS.cleanIngredients(loose.ing); out.steps = TOOLS.cleanSteps(loose.steps);
  }
  return out;
}

function fromText(md, url) {
  const title = (/^Title:\s*(.+)$/m.exec(md) || [])[1] || "";
  const p = parseText(md.replace(/^(Title|URL Source|Markdown Content|Published Time):.*$/gm, ""));
  if (p.ingredients.length < 2 || !p.steps.length) return null;
  const img = [...md.matchAll(/!\[[^\]]*\]\((https?:[^)\s]+)\)/g)].map(m => m[1]).find(u => /\.(jpe?g|png|webp)/i.test(u) && !/logo|icon|avatar|sprite|badge/i.test(u));
  return { ...p, title: txt(title.split(/\s[|–-]\s/)[0]) || p.title, source: url, image: img || "", how: "text" };
}

const HOW_RANK = { structured: 3, plugin: 2, layout: 1, text: 0 };
async function importUrl(url) {
  let seen = ""; const cands = [];
  // Structured recipe data is the most trustworthy, so it wins immediately. Anything weaker is kept, and the best one is used if nothing better arrives.
  const judge = r => { cands.push(r); return r.how === "structured" ? r : Promise.reject(); };
  const fromPage = h => { seen ||= h; const r = extractRecipe(new DOMParser().parseFromString(h, "text/html"), url); return r ? judge(r) : Promise.reject(); };
  const html = PROXIES.map(p => grab(p(url)).then(fromPage));
  // The text-reader fallback only starts if the page routes are slow or have all failed
  const reader = Promise.race([new Promise(r => setTimeout(r, 3500)), Promise.allSettled(html)]).then(() => grab("https://r.jina.ai/" + url, 25000)).then(m => { const r = fromText(m, url); return r ? judge(r) : Promise.reject(); });
  try { return await Promise.any([...html, reader]); } catch {}
  if (cands.length) return cands.sort((a, b) => (HOW_RANK[b.how] || 0) - (HOW_RANK[a.how] || 0) || b.steps.length - a.steps.length)[0];
  if (!seen) throw new Error("fetch");
  const dom = new DOMParser().parseFromString(seen, "text/html"), og = k => dom.querySelector(`meta[property="og:${k}"]`)?.content || "";
  throw Object.assign(new Error("norecipe"), { partial: { title: txt(og("title") || dom.title), image: absUrl(og("image"), url), source: url } });
}

// A short, honest summary of what an import found, with a warning when it was a best guess
const importNote = (x, host) => `Imported${host ? " from " + host : ""}: ${x.ingredients.length} ingredients and ${x.steps.length} steps.` +
  (x.how === "layout" || x.how === "text" ? " This site doesn't publish clean recipe data, so this is a best guess. Please check the steps." : x.steps.length ? " Check the details, then save." : " No steps were found, so add them below.");
const takeSeed = () => {
  try {
    const v = sessionStorage.getItem("garde.seed"); sessionStorage.removeItem("garde.seed"); if (!v) return null;
    const j = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))));
    const str = (x, n) => typeof x === "string" ? x.slice(0, n) : "", arr = x => Array.isArray(x) ? x.filter(i => typeof i === "string").slice(0, 80).map(i => i.slice(0, 600)) : [];
    return { title: str(j.title, 200), source: str(j.source, 600), time: str(j.time, 40), servings: str(j.servings, 6), image: str(j.image, 800), ingredients: arr(j.ingredients), steps: arr(j.steps), tags: arr(j.tags).slice(0, 6), how: str(j.how, 12) };
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

// Smart scan (Garde Reserve): the photo goes to our Cloudflare helper, which has Google Gemini read it. See worker.js.
async function smartScan(file) {
  const image = (await resizeImage(file, 1600, 0.8)).split(",")[1], token = await auth.currentUser.getIdToken();
  const r = await fetch(IMPORT_PROXY, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ image }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Smart scan failed");
  return { title: j.title || "", servings: j.servings || "", time: j.time || "", ingredients: j.ingredients || [], steps: j.steps || [], tags: j.tags || [] };
}

function form(id) {
  const base = { title: "", source: "", time: "", servings: "", image: "", ingredients: [], steps: [], tags: [], notes: "" };
  const fill = (a, b) => ({ ...a, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v && (!Array.isArray(v) || v.length))) });
  const seed = id ? null : takeSeed();
  let pending = id ? "" : (seed ? (takeShare(), "") : takeShare()), existing = [];
  if (!id) warm().catch(() => {});
  // Photos live outside render() so they survive the page being redrawn after an import
  const photo = { thumb: "", full: "", scan: "", keepScan: true };
  const render = async (r, msg = "") => {
    const ok = await show("add", { editing: !!id, msg, title: r.title, time: r.time, servings: r.servings, ingredients: r.ingredients.join("\n"), steps: r.steps.join("\n"), tags: r.tags.join(", "), image: r.image, notes: r.notes,
      smart: isReserve && !!IMPORT_PROXY, dup: id ? null : dupOf(r, existing), preview: photo.full || photo.thumb, hasScan: !!photo.scan, keepScan: photo.keepScan });
    if (!ok) return;
    const st = m => { const e = $("#st"); if (e) e.textContent = m; };
    const busy = (on, label, p) => { const b = $("#prog"); if (!b) return; b.hidden = !on; $("#pt").textContent = label || ""; b.classList.toggle("ind", p == null); b.querySelector("i").style.width = p == null ? "40%" : Math.round(p * 100) + "%"; };
    const cur = () => ({ title: $("#title").value, source: r.source, time: $("#time").value, servings: $("#serv").value, image: $("#img").value, ingredients: lines($("#ing").value), steps: lines($("#stp").value), tags: $("#tags").value.split(",").map(t => t.trim()).filter(Boolean), notes: $("#notes").value });
    $("#photo").onchange = async e => { const f = e.target.files[0]; if (!f) return; try { photo.full = await resizeImage(f, 900, 0.75); photo.thumb = await thumbOf(f); render(cur(), "Photo added."); } catch { st("Couldn't read that image. Try a JPG or PNG."); } };
    if ($("#photox")) $("#photox").onclick = () => { photo.full = ""; photo.thumb = ""; render(cur()); };
    if ($("#keepscan")) $("#keepscan").onchange = e => { photo.keepScan = e.target.checked; };
    if (!id) {
      const doImport = async u => {
        u = u.trim(); if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(u)) u = "https://" + u;
        if (!/^https?:\/\//i.test(u)) return st("Paste a full recipe link first.");
        busy(true, "Fetching the recipe…"); st("");
        try { const x = await importUrl(u); busy(false); render(fill(cur(), x), importNote(x)); }
        catch (e) { busy(false); const m = "Some sites block automatic import. Use the Save to Garde button below, or paste the recipe text and Garde will pick out the ingredients and steps."; if (e.partial) render(fill(cur(), e.partial), "I found the title and photo but not the recipe. " + m); else st("Couldn't open that page. " + m); const b = $("#bm"); if (b) b.open = true; }
      };
      $("#imp").onclick = () => doImport($("#url").value);
      if (pending) { const u = pending; pending = ""; $("#url").value = u; doImport(u); }
      $("#url").onkeydown = e => { if (e.key === "Enter") doImport(e.target.value); };
      $("#bml").href = bookmarklet(location.origin + location.pathname); $("#bml").onclick = e => { e.preventDefault(); toast("Drag this button up to your bookmarks bar"); };
      $("#pgo").onclick = () => { const t = $("#ptxt").value.trim(); if (t.length < 40) return st("Paste the recipe text first."); const p = parseText(t); if (!p.ingredients.length && !p.steps.length) return st("I couldn't find ingredients or steps in that text. Make sure it includes the ingredient list."); render(fill(cur(), p), "Recipe extracted. Check the details, then save."); };
      $("#url").onpaste = e => { const t = e.clipboardData.getData("text").trim(); if (/^https?:\/\//i.test(t)) setTimeout(() => doImport(t), 0); };
      const doScan = async f => {
        if (!f || !f.type.startsWith("image/")) return st("Choose an image file (JPG or PNG).");
        st(""); busy(true, "Preparing photo…", .03);
        try {
          try { photo.scan = await resizeImage(f, 1200, 0.65); photo.keepScan = true; } catch (e) { photo.scan = ""; }
          if (isReserve && IMPORT_PROXY) {
            try { busy(true, "Reading with smart scan…"); const p = await smartScan(f); busy(false); render(fill(cur(), p), "Smart scan finished. Check the details, then save."); return; }
            catch (e) { console.warn("Smart scan unavailable, using basic scan:", e.message); }
          }
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
      if (!id) { const d0 = dupOf(d, existing); if (d0 && !confirm(`You already have "${d0.title}". Save another copy anyway?`)) return; }
      d.thumb = photo.thumb || "";
      let scan = photo.keepScan ? photo.scan : "";
      if ((photo.full || "").length + (scan || "").length > 900000) { scan = ""; toast("The scanned card was too large to keep, so only the recipe was saved."); }
      try {
        let rid = id;
        if (id) await updateDoc(doc(db, "users", user.uid, "recipes", id), d);
        else {
          if (!isReserve && (await load()).length >= FREE_LIMIT) { toast(`Free accounts hold ${FREE_LIMIT} recipes. Garde Reserve removes the limit.`); return; }
          rid = (await addDoc(col(), { ...d, favorite: false, createdAt: serverTimestamp() })).id;
        }
        const pref = doc(db, "users", user.uid, "photos", rid);
        if (photo.full || scan) await setDoc(pref, { data: photo.full || "", scan: scan || "" }); else if (id) await deleteDoc(pref).catch(() => {});
        recipes = null; toast("Recipe saved"); location.hash = "#/dashboard";
      } catch { toast("Couldn't save. Check your connection and try again."); }
    };
  };
  if (!id) { let host = ""; try { host = new URL(seed.source).hostname.replace(/^www\./, ""); } catch {} load().then(x => { existing = x; }).catch(() => {}).finally(() => render(seed ? fill(base, seed) : base, seed ? importNote(seed, host) : "")); return; }
  (async () => {
    const [s, ps] = await Promise.all([getDoc(doc(db, "users", user.uid, "recipes", id)), getDoc(doc(db, "users", user.uid, "photos", id)).catch(() => null)]);
    if (!s.exists()) { await show("recipe#notfound"); return; }
    photo.thumb = s.data().thumb || ""; if (ps && ps.exists()) { photo.full = ps.data().data || ""; photo.scan = ps.data().scan || ""; }
    render({ ...base, ...s.data() });
  })();
}

// ---- Duplicate detection ----
const normUrl = u => { try { const x = new URL(u), keep = [...x.searchParams].filter(([k]) => !/^(utm_|fbclid|gclid|mc_|ref$|source$|cmp)/i.test(k)).sort(); return x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "") + (keep.length ? "?" + keep.map(p => p.join("=")).join("&") : ""); } catch { return ""; } };
const dupOf = (r, list) => { const u = normUrl(r.source || ""), t = (r.title || "").trim().toLowerCase(); return list.find(x => (u && normUrl(x.source || "") === u) || (t && (x.title || "").trim().toLowerCase() === t)) || null; };
const takeShare = () => { try { const v = sessionStorage.getItem("garde.shareurl"); sessionStorage.removeItem("garde.shareurl"); return v || ""; } catch { return ""; } };

// ---- "I always have this" list (synced to your account) ----
let have = null;
const haveRef = () => doc(db, "users", user.uid, "meta", "pantry");
async function loadHave() {
  if (have) return have;
  try { const s = await getDoc(haveRef()); have = s.exists() ? (s.data().have || []) : lsGet("garde.have", []); } catch { have = lsGet("garde.have", []); }
  return have;
}
const saveHave = () => { lsSet("garde.have", have); setDoc(haveRef(), { have }, { merge: true }).catch(() => {}); };

// ---- Collections ----
async function collections() {
  const all = await load(), g = {};
  all.forEach(r => (r.tags?.length ? r.tags : ["Untagged"]).forEach(t => (g[t.toLowerCase()] ||= { n: t, r: [] }).r.push(r)));
  await show("collections", { none: !all.length, groups: Object.values(g).sort((a, b) => b.r.length - a.r.length).map(x => ({ name: x.n, count: x.r.length, recipes: x.r.map(r => ({ id: r.id, title: r.title, time: r.time || "" })) })) });
}

// ---- Pantry: combined, scaled shopping list ----
async function pantry() {
  const all = await load();
  const plan = isReserve ? await weekEntries(ctx).catch(() => []) : [];
  const planServ = {}; plan.forEach(e => { planServ[e.rid] = (planServ[e.rid] || 0) + (e.servings || 0); });
  let pick = lsGet("garde.pick", []).filter(id => all.some(r => r.id === id)), done = lsGet("garde.done", []), serv = lsGet("garde.serv", {});
  const planned = all.filter(r => planServ[r.id]);
  await loadHave();
  const BASICS = ["salt", "black pepper", "olive oil", "butter", "flour", "sugar", "garlic", "water"];
  const draw = async () => {
    const hidden = [], groups = buildList(all.filter(r => pick.includes(r.id) || planServ[r.id]), { ...serv, ...planServ }, have, hidden);
    const ok = await show("pantry", { any: all.length > 0, hasDone: done.length > 0,
      planned: planned.map(r => ({ id: r.id, title: r.title, servings: planServ[r.id] })),
      haveList: have, suggest: BASICS.filter(b => !have.includes(b)), hiddenText: hidden.join(", "),
      recipes: all.filter(r => !planServ[r.id]).map(r => { const base = parseInt(r.servings) || 0; return { id: r.id, title: r.title, checked: pick.includes(r.id), base, cur: serv[r.id] || base }; }),
      aisles: ORDER.filter(a => groups[a]).map(a => ({ name: a, items: groups[a].map(e => { const id = a + "|" + e.key; return { id, text: itemText(e), checked: done.includes(id), name: normName(e.name) }; }) })) });
    if (!ok) return;
    app.querySelectorAll("[data-r]").forEach(c => c.onchange = () => { pick = c.checked ? [...pick, c.dataset.r] : pick.filter(x => x !== c.dataset.r); lsSet("garde.pick", pick); draw(); });
    app.querySelectorAll("[data-i]").forEach(c => c.onchange = () => { const i = c.dataset.i; done = c.checked ? [...done, i] : done.filter(x => x !== i); lsSet("garde.done", done); draw(); });
    app.querySelectorAll("[data-s] button").forEach(b => b.onclick = () => { const id = b.parentElement.dataset.s, r = all.find(x => x.id === id), base = parseInt(r.servings) || 1; serv[id] = Math.max(1, Math.min(99, (serv[id] || base) + +b.dataset.d)); lsSet("garde.serv", serv); draw(); });
    if ($("#clr")) $("#clr").onclick = () => { done = []; lsSet("garde.done", done); draw(); };
    const addHave = raw => { const n = normName(raw); if (!n || have.includes(n)) return; have = [...have, n]; saveHave(); draw(); };
    app.querySelectorAll("[data-have]").forEach(b => b.onclick = () => addHave(b.dataset.have));
    app.querySelectorAll("[data-unhave]").forEach(b => b.onclick = () => { have = have.filter(x => x !== b.dataset.unhave); saveHave(); draw(); });
    if ($("#haveaddbtn")) { const go = () => { const v = $("#haveadd").value; v.split(",").forEach(addHave); }; $("#haveaddbtn").onclick = go; $("#haveadd").onkeydown = e => { if (e.key === "Enter") go(); }; }
    const text = ORDER.filter(a => groups[a]).map(a => a + "\n" + groups[a].map(e => "- " + itemText(e)).join("\n")).join("\n\n");
    if ($("#cpl")) $("#cpl").onclick = async () => { try { await navigator.clipboard.writeText("Garde Pantry\n\n" + text); toast("List copied"); } catch { toast("Couldn't copy. Select the list and copy it by hand."); } };
    if ($("#shl") && navigator.share) { $("#shl").hidden = false; $("#shl").onclick = () => navigator.share({ title: "Garde Pantry", text }).catch(() => {}); }
  };
  draw();
}

// ---- Settings ----
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; });
async function deleteAccount() {
  if (prompt("This permanently deletes your account, recipes, photos, plans and shared links. Type DELETE to confirm.") !== "DELETE") return;
  try {
    await reauthenticateWithPopup(auth.currentUser, provider);
    const uid = user.uid, wipe = async s => { await Promise.all(s.docs.map(d => deleteDoc(d.ref))); };
    for (const sub of ["recipes", "photos", "plans", "templates", "meta"]) await wipe(await getDocs(collection(db, "users", uid, sub)));
    await wipe(await getDocs(query(collection(db, "shared"), where("uid", "==", uid))));
    await deleteDoc(doc(db, "profiles", uid)).catch(() => {});
    await deleteUser(auth.currentUser);
    try { Object.keys(localStorage).filter(k => k.startsWith("garde.")).forEach(k => localStorage.removeItem(k)); } catch {}
    toast("Your account was deleted."); location.hash = "#/";
  } catch (e) { toast("Couldn't delete the account. Sign in again and retry, or contact support."); }
}
async function settings() {
  if (!(await show("settings", { name: user.displayName || "", email: user.email || "", uid: user.uid, reserve: isReserve, staff: isStaff, canInstall: !!installEvt }))) return;
  $("#out2").onclick = () => signOut(auth).then(() => location.hash = "#/");
  $("#delacct").onclick = deleteAccount;
  if ($("#inst") && installEvt) $("#inst").onclick = async () => { installEvt.prompt(); try { await installEvt.userChoice; } catch {} installEvt = null; settings(); };
  $("#exp").onclick = async () => {
    const all = (await load()).map(({ createdAt, thumb, ...r }) => r);
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([JSON.stringify(all, null, 2)], { type: "application/json" })), download: "garde-recipes.json" });
    a.click(); toast("Export downloaded");
  };
}

// ---- Shared helpers and feature modules ----
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const stashSeed = o => { try { sessionStorage.setItem("garde.seed", btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")); } catch {} };
const ctx = { have: () => have || [], db, app, $, esc, toast, FREE_LIMIT, load, col, lsGet, lsSet, importUrl, show, fill, view, faqItems, stashSeed, refreshBanner: loadBanner,
  invalidate: () => { recipes = null; }, setUnsub: f => { unsub = f; },
  get smart() { return !!IMPORT_PROXY; }, get user() { return user; }, get isStaff() { return isStaff; }, get isAdmin() { return isAdmin; }, get isReserve() { return isReserve; } };
const P = mountSupport(ctx), S = mountSous(ctx), C = mountCook(ctx), X = mountExtras(ctx), ST = mountStatus(ctx), N = mountNews(ctx);
ctx.statusAdmin = ST.admin; ctx.newsAdmin = N.admin;
loadBanner(); ST.watchBar();

// Tap a photo to enlarge it
document.addEventListener("click", e => { const z = e.target.closest && e.target.closest(".zoomable"); if (z) z.classList.toggle("zoom"); });

// Automatic problem reports for the Staff > Errors tab (signed-in users only, a handful per visit)
let reported = 0;
const report = (message, stack) => {
  if (!user || reported >= 5 || !message) return; reported++;
  addDoc(collection(db, "errors"), { at: serverTimestamp(), uid: user.uid, message: String(message).slice(0, 300), stack: String(stack || "").slice(0, 900), url: (location.hash || "#/").slice(0, 120), ua: navigator.userAgent.slice(0, 140) }).catch(() => {});
};
window.addEventListener("error", e => report(e.message, e.error && e.error.stack));
window.addEventListener("unhandledrejection", e => report(e.reason && e.reason.message || e.reason, e.reason && e.reason.stack));

// Lets Garde be installed on a phone or computer, and keeps the app shell available offline
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
