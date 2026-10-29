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
  $("#nav").innerHTML = `<a class="logo" href="#/">Recolio</a>` + (user
    ? `${l("#/dashboard", "My recipes")}${l("#/add", "Add recipe")}<img class="avatar" src="${esc(user.photoURL || "")}" alt="" referrerpolicy="no-referrer"><button class="btn" id="out">Sign out</button>`
    : `${l("#/", "Home")}<a class="btn main" href="#/login">Sign in</a>`);
  const o = $("#out"); if (o) o.onclick = () => signOut(auth).then(() => location.hash = "#/");
}

async function route() {
  if (!ready) return;
  nav();
  const [, page, id] = (location.hash || "#/").split("/");
  const guarded = ["dashboard", "add", "recipe", "edit"];
  if (guarded.includes(page) && !user) { location.hash = "#/login"; return; }
  if (page === "login" && user) { location.hash = "#/dashboard"; return; }
  ({ "": home, login: loginView, dashboard, add: () => form(), recipe: () => detail(id), edit: () => form(id) }[page] || home)();
  window.scrollTo(0, 0);
}

function home() {
  app.innerHTML = `
  <section class="hero">
    <div>
      <h1>Every recipe you've loved, in one place.</h1>
      <p class="lead">Save a recipe from any website, snap a photo of a handwritten card, or type it in. Recolio keeps it all searchable and ready when you're cooking.</p>
      <div class="row"><a class="btn main" href="#/${user ? "add" : "login"}">${user ? "Add a recipe" : "Start your collection"}</a>${user ? `<a class="btn" href="#/dashboard">My recipes</a>` : ""}</div>
    </div>
    <div class="stack" aria-hidden="true">
      <div class="card glass"><span class="tag">From a website</span><h3>Brown butter cookies</h3><small>35 min · 24 cookies</small></div>
      <div class="card glass"><span class="tag">Scanned from paper</span><h3>Nonna's lemon bars</h3><small>Handwritten card, saved forever</small></div>
      <div class="card glass"><span class="tag">Favorite</span><h3>Weeknight green curry</h3><small>25 min · serves 4</small></div>
    </div>
  </section>
  <section class="features">
    <div class="glass"><h3>Import from any link</h3><p>Paste a recipe URL and Recolio pulls in the title, ingredients and steps.</p></div>
    <div class="glass"><h3>Scan paper recipes</h3><p>Upload a photo of a cookbook page or recipe card and turn it into editable text.</p></div>
    <div class="glass"><h3>Find it fast</h3><p>Search by name, ingredient or tag, and pin your favorites to the top.</p></div>
  </section>`;
}

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
      ? `<div class="empty glass"><h3>No recipes yet</h3>Add your first one from a link, a photo, or by typing it in.<p><br><a class="btn main" href="#/add">Add recipe</a></p></div>`
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
    <div class="panel glass"><h3>Ingredients</h3><br><ul>${(r.ingredients || []).map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>
    <div class="panel glass"><h3>Steps</h3><br><ol>${(r.steps || []).map(i => `<li>${esc(i)}</li>`).join("")}</ol>${r.notes ? `<br><h3>Notes</h3><p class="meta">${esc(r.notes)}</p>` : ""}</div></div>`;
  $("#fv").onclick = async () => { await updateDoc(doc(db, "users", user.uid, "recipes", id), { favorite: !r.favorite }); recipes = null; detail(id); };
  $("#del").onclick = async () => { if (!confirm(`Delete "${r.title}"? This can't be undone.`)) return; await deleteDoc(doc(db, "users", user.uid, "recipes", id)); recipes = null; toast("Recipe deleted"); location.hash = "#/dashboard"; };
}

// ---- Import helpers ----
const dur = iso => { const m = /P(?:T)?(?:(\d+)H)?(?:(\d+)M)?/.exec(iso || ""); return m && (m[1] || m[2]) ? [m[1] && m[1] + " h", m[2] && m[2] + " min"].filter(Boolean).join(" ") : ""; };
const flat = n => !n ? [] : typeof n === "string" ? [n] : Array.isArray(n) ? n.flatMap(flat) : n.itemListElement ? flat(n.itemListElement) : n.text ? [n.text] : [];
const clean = s => { const d = document.createElement("div"); d.innerHTML = s; return d.textContent.trim(); };

async function importUrl(url) {
  const res = await fetch("https://api.allorigins.win/raw?url=" + encodeURIComponent(url));
  if (!res.ok) throw new Error("fetch");
  const dom = new DOMParser().parseFromString(await res.text(), "text/html");
  let rec = null;
  const find = n => { if (!n || rec || typeof n !== "object") return; if (Array.isArray(n)) return n.forEach(find); if ([].concat(n["@type"] || []).includes("Recipe")) { rec = n; return; } find(n["@graph"]); };
  dom.querySelectorAll('script[type="application/ld+json"]').forEach(s => { try { find(JSON.parse(s.textContent)); } catch {} });
  if (!rec) throw new Error("norecipe");
  const img = [].concat(rec.image || [])[0];
  return { title: clean(rec.name || ""), source: url, time: dur(rec.totalTime), servings: String([].concat(rec.recipeYield || [""])[0]).replace(/\D+.*/, ""),
    image: typeof img === "string" ? img : img?.url || "", ingredients: (rec.recipeIngredient || []).map(clean), steps: flat(rec.recipeInstructions).map(clean),
    tags: String([].concat(rec.recipeCategory || [], rec.keywords || []).join(",")).split(",").map(t => t.trim()).filter(Boolean).slice(0, 5) };
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
      <label for="notes">Notes</label><textarea id="notes" style="min-height:70px">${esc(r.notes)}</textarea><br>
      <div class="row"><button class="btn main" id="save">Save recipe</button><a class="btn" href="#/dashboard">Cancel</a></div></div>`;
    const st = m => { const e = $("#st"); if (e) e.textContent = m; };
    const cur = () => ({ title: $("#title").value, source: r.source, time: $("#time").value, servings: $("#serv").value, image: $("#img").value, ingredients: lines($("#ing").value), steps: lines($("#stp").value), tags: $("#tags").value.split(",").map(t => t.trim()).filter(Boolean), notes: $("#notes").value });
    if (!id) {
      $("#imp").onclick = async () => {
        const u = $("#url").value.trim(); if (!u) return st("Paste a recipe link first.");
        st("Importing…");
        try { render({ ...base, ...(await importUrl(u)) }); $("#st").textContent = "Imported. Check the details, then save."; }
        catch (e) { st(e.message === "norecipe" ? "That page doesn't share recipe data. Add it by hand below." : "Couldn't reach that page. Try again or add it by hand."); }
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
