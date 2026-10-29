import * as pg from "./pages.js";
import { auth, db, provider } from "./firebase-config.js";
import { onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, doc, getDoc, getDocs, updateDoc, deleteDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lines = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);
const app = $("#app");
let user = null, ready = false, recipes = null;

const toast = m => { const t = $("#toast"); t.textContent = m; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 2600); };
const col = () => collection(db, "users", user.uid, "recipes");

onAuthStateChanged(auth, u => { user = u; ready = true; recipes = null; route(); });
window.addEventListener("hashchange", route);

async function login() {
  try { await signInWithPopup(auth, provider); location.hash = "#/dashboard"; }
  catch (e) { toast("Sign-in didn't finish. Try again."); }
}

function nav() {
  const h = location.hash || "#/";
  const l = (href, label) => `<a class="l" href="${href}" ${h === href ? "aria-current=page" : ""}>${label}</a>`;
  const lh = (href, label) => l(href, label).replace('class="l"', 'class="l hide"');
  $("#nav").innerHTML = `<a class="logo" href="#/">Recolio</a>` + (user
    ? `${l("#/dashboard", "My recipes")}${l("#/collections", "Collections")}${l("#/shopping", "Shopping")}${l("#/add", "Add recipe")}<a href="#/settings" aria-label="Settings"><img class="avatar" src="${esc(user.photoURL || "")}" alt="" referrerpolicy="no-referrer"></a>`
    : `${l("#/", "Home")}${lh("#/features", "Features")}${lh("#/about", "About")}<a class="btn main" href="#/login">Sign in</a>`);
  $("#foot").innerHTML = pg.footer();
  const o = $("#out"); if (o) o.onclick = () => signOut(auth).then(() => location.hash = "#/");
}

async function route() {
  if (!ready) return;
  nav();
  const [, page, id] = (location.hash || "#/").split("/");
  const guarded = ["dashboard", "add", "recipe", "edit", "collections", "shopping", "settings"];
  if (guarded.includes(page) && !user) { location.hash = "#/login"; return; }
  if (page === "login" && user) { location.hash = "#/dashboard"; return; }
  ({ "": home, login: loginView, dashboard, add: () => form(), recipe: () => detail(id), edit: () => form(id), features: stat("features"), about: stat("about"), collections, shopping, settings }[page] || home)();
  window.scrollTo(0, 0);
}

const home = () => { app.innerHTML = pg.home(user); };
const stat = f => () => { app.innerHTML = pg[f](); };

function loginView() {
  app.innerHTML = `<div class="center glass"><h2>Welcome to Recolio</h2><p>Sign in or create your account with Google. Your recipes stay private to you.</p><button class="btn main" id="g">Continue with Google</button></div>`;
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
      : `<div class="grid">${f.map(r => `<a class="rc glass" href="#/recipe/${r.id}"><div class="img" style="${r.image ? `background-image:url('${esc(r.image)}')` : ""}">${r.image ? "" : "🍽️"}</div><div class="body"><h3>${r.favorite ? "★ " : ""}${esc(r.title)}</h3><small>${esc([r.time, r.servings && r.servings + " servings"].filter(Boolean).join(" · ") || "No details yet")}</small></div></a>`).join("")}</div>`;
  };
  $("#q").oninput = e => { q = e.target.value.toLowerCase(); draw(); };
  $("#fav").onclick = e => { fav = !fav; e.target.setAttribute("aria-pressed", fav); draw(); };
  draw();
}

async function detail(id) {
  const s = await getDoc(doc(db, "users", user.uid, "recipes", id));
  if (!s.exists()) { app.innerHTML = `<div class="empty glass"><h3>Recipe not found</h3><a class="btn" href="#/dashboard">Back to my recipes</a></div>`; return; }
  const r = { id, ...s.data() };
  app.innerHTML = `<div class="detail">
    ${r.image ? `<div class="cover" style="background-image:url('${esc(r.image)}')"></div>` : ""}
    <div class="hdr"><div><h2>${esc(r.title)}</h2><p class="meta">${esc([r.time, r.servings && r.servings + " servings", (r.tags || []).join(", ")].filter(Boolean).join(" · "))}${r.source ? ` · <a href="${esc(r.source)}" target="_blank" rel="noopener noreferrer">Original</a>` : ""}</p></div>
      <div class="row"><button class="btn" id="fv">${r.favorite ? "★ Favorited" : "☆ Favorite"}</button><a class="btn" href="#/edit/${id}">Edit</a><button class="btn danger" id="del">Delete</button></div></div>
    <div class="panel glass"><h3>Ingredients</h3><ul>${(r.ingredients || []).map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>
    <div class="panel glass"><h3>Steps</h3><ol>${(r.steps || []).map(i => `<li>${esc(i)}</li>`).join("")}</ol>${r.notes ? `<h3 style="margin-top:28px">Notes</h3><p class="meta notes">${esc(r.notes)}</p>` : ""}</div></div>`;
  $("#fv").onclick = async () => { await updateDoc(doc(db, "users", user.uid, "recipes", id), { favorite: !r.favorite }); recipes = null; detail(id); };
  $("#del").onclick = async () => { if (!confirm(`Delete "${r.title}"? This can't be undone.`)) return; await deleteDoc(doc(db, "users", user.uid, "recipes", id)); recipes = null; toast("Recipe deleted"); location.hash = "#/dashboard"; };
}

// ---- Import helpers ----
const txt = h => new DOMParser().parseFromString(String(h ?? ""), "text/html").body.textContent.trim();
const dur = iso => { const m = /P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(iso || ""); return m && (m[1] || m[2]) ? [m[1] && m[1] + " h", m[2] && m[2] + " min"].filter(Boolean).join(" ") : ""; };
const flat = n => !n ? [] : typeof n === "string" ? [n] : Array.isArray(n) ? n.flatMap(flat) : n.itemListElement ? flat(n.itemListElement) : n.text ? [n.text] : [];
const PROXIES = [u => "https://corsproxy.io/?url=" + encodeURIComponent(u), u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u), u => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u)];
async function getHtml(url) {
  for (const p of PROXIES) {
    try { const c = new AbortController(), t = setTimeout(() => c.abort(), 10000); const r = await fetch(p(url), { signal: c.signal }); clearTimeout(t); if (r.ok) { const x = await r.text(); if (x.length > 500) return x; } } catch {}
  }
  throw new Error("fetch");
}
async function importUrl(url) {
  const dom = new DOMParser().parseFromString(await getHtml(url), "text/html");
  let rec = null;
  const find = n => { if (!n || rec || typeof n !== "object") return; if (Array.isArray(n)) return n.forEach(find); if ([].concat(n["@type"] || []).some(t => /Recipe$/i.test(t))) { rec = n; return; } Object.values(n).forEach(find); };
  dom.querySelectorAll('script[type="application/ld+json"]').forEach(s => { try { find(JSON.parse(s.textContent)); } catch {} });
  const og = k => dom.querySelector(`meta[property="og:${k}"]`)?.content || "";
  if (!rec) throw Object.assign(new Error("norecipe"), { partial: { title: txt(og("title") || dom.title), image: og("image"), source: url } });
  const img = [].concat(rec.image || [])[0];
  return { title: txt(rec.name), source: url, time: dur(rec.totalTime), servings: String([].concat(rec.recipeYield || [""])[0]).replace(/\D.*/, ""),
    image: typeof img === "string" ? img : img?.url || og("image"), ingredients: (rec.recipeIngredient || []).map(txt), steps: flat(rec.recipeInstructions).map(txt),
    tags: [].concat(rec.recipeCategory || [], String(rec.keywords || "").split(",")).map(t => String(t).trim()).filter(Boolean).slice(0, 5) };
}

function form(id) {
  const base = { title: "", source: "", time: "", servings: "", image: "", ingredients: [], steps: [], tags: [], notes: "" };
  const render = r => {
    app.innerHTML = `<h2>${id ? "Edit recipe" : "Add a recipe"}</h2>
    ${id ? "" : `<div class="panel glass"><div class="two">
      <div><label for="url">Import from a website</label><div class="row" style="flex-wrap:nowrap"><input id="url" type="url" placeholder="https://..."><button class="btn" id="imp">Import</button></div></div>
      <div><label for="scan">Scan from paper (photo of a recipe)</label><input id="scan" type="file" accept="image/*"></div></div><p class="status" id="st"></p></div>`}
    <div class="panel glass"><label for="title">Title</label><input id="title" value="${esc(r.title)}" required>
      <div class="two"><div><label for="time">Total time</label><input id="time" value="${esc(r.time)}" placeholder="45 min"></div><div><label for="serv">Servings</label><input id="serv" value="${esc(r.servings)}" inputmode="numeric"></div></div>
      <label for="ing">Ingredients (one per line)</label><textarea id="ing">${esc(r.ingredients.join("\n"))}</textarea>
      <label for="stp">Steps (one per line)</label><textarea id="stp">${esc(r.steps.join("\n"))}</textarea>
      <div class="two"><div><label for="tags">Tags (comma separated)</label><input id="tags" value="${esc(r.tags.join(", "))}" placeholder="dinner, vegetarian"></div><div><label for="img">Photo link</label><input id="img" value="${esc(r.image)}"></div></div>
      <label for="notes">Notes</label><textarea id="notes" style="min-height:70px">${esc(r.notes)}</textarea>
      <div class="row" style="margin-top:28px"><button class="btn main" id="save">Save recipe</button><a class="btn" href="#/dashboard">Cancel</a></div></div>`;
    const st = m => { const e = $("#st"); if (e) e.textContent = m; };
    const cur = () => ({ title: $("#title").value, source: r.source, time: $("#time").value, servings: $("#serv").value, image: $("#img").value, ingredients: lines($("#ing").value), steps: lines($("#stp").value), tags: $("#tags").value.split(",").map(t => t.trim()).filter(Boolean), notes: $("#notes").value });
    if (!id) {
      $("#imp").onclick = async () => {
        const u = $("#url").value.trim(); if (!u) return st("Paste a recipe link first.");
        st("Importing…");
        try { render({ ...base, ...(await importUrl(u)) }); $("#st").textContent = "Imported. Check the details, then save."; }
        catch (e) { if (e.partial) { render({ ...base, ...e.partial }); $("#st").textContent = "No recipe data found on that page. I filled in the title and photo; add the rest below."; } else st("Couldn't reach that page right now. Try again or add it by hand."); }
      };
      $("#scan").onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        st("Reading your photo… this can take a moment.");
        try { const { data } = await Tesseract.recognize(f, "eng"); const cu = cur(); cu.steps = lines(data.text); render({ ...base, ...cu }); $("#st").textContent = "Done. The text is in Steps; sort ingredients and steps, then save."; }
        catch { st("Couldn't read that image. Try a clearer, well-lit photo."); }
      };
    }
    $("#save").onclick = async () => {
      const d = cur(); if (!d.title.trim()) { toast("Add a title first"); return; }
      try {
        if (id) await updateDoc(doc(db, "users", user.uid, "recipes", id), d);
        else await addDoc(col(), { ...d, favorite: false, createdAt: serverTimestamp() });
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

async function shopping() {
  const all = await load(), ls = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  let pick = ls("recolio.pick", []), done = ls("recolio.done", []);
  const draw = () => {
    const items = [...new Set(all.filter(r => pick.includes(r.id)).flatMap(r => r.ingredients || []).map(i => i.trim()))];
    app.innerHTML = `<h1 class="pg">Shopping list</h1><p class="lead">Pick the recipes you're cooking and get one combined checklist.</p>
    ${all.length ? `<div class="detail"><div class="panel glass"><h3>Recipes</h3><ul class="tick">${all.map(r => `<li><label><input type="checkbox" data-r="${r.id}" ${pick.includes(r.id) ? "checked" : ""}><span>${esc(r.title)}</span></label></li>`).join("")}</ul></div>
    <div class="panel glass"><h3>To buy</h3>${items.length ? `<ul class="tick">${items.map((i, n) => `<li><label><input type="checkbox" data-i="${n}" ${done.includes(i) ? "checked" : ""}><span>${esc(i)}</span></label></li>`).join("")}</ul>` : `<p class="meta">Select a recipe to build your list.</p>`}</div></div>`
    : `<div class="empty glass"><h3>No recipes to shop for</h3>Add a recipe first.<br><a class="btn main" href="#/add">Add recipe</a></div>`}`;
    app.querySelectorAll("[data-r]").forEach(c => c.onchange = () => { pick = c.checked ? [...pick, c.dataset.r] : pick.filter(x => x !== c.dataset.r); try { localStorage.setItem("recolio.pick", JSON.stringify(pick)); } catch {} draw(); });
    app.querySelectorAll("[data-i]").forEach(c => c.onchange = () => { const i = items[c.dataset.i]; done = c.checked ? [...done, i] : done.filter(x => x !== i); try { localStorage.setItem("recolio.done", JSON.stringify(done)); } catch {} draw(); });
  };
  draw();
}

function settings() {
  app.innerHTML = `<h1 class="pg">Settings</h1><div class="panel glass"><h3>Account</h3><p class="meta">${esc(user.displayName || "")}<br>${esc(user.email || "")}</p><div class="row" style="margin-top:22px"><button class="btn" id="out2">Sign out</button></div></div>
  <div class="panel glass"><h3>Your data</h3><p class="meta">Download every recipe as a JSON file.</p><div class="row" style="margin-top:22px"><button class="btn main" id="exp">Export recipes</button></div></div>`;
  $("#out2").onclick = () => signOut(auth).then(() => location.hash = "#/");
  $("#exp").onclick = async () => {
    const all = (await load()).map(({ createdAt, ...r }) => r);
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([JSON.stringify(all, null, 2)], { type: "application/json" })), download: "recolio-recipes.json" });
    a.click(); toast("Export downloaded");
  };
}
