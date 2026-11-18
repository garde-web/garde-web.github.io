import { collection, doc, getDoc, getDocs, setDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { LIBRARY } from "./library.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MEALS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"]];
const pad = n => String(n).padStart(2, "0");
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mondayOf = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const planRef = (ctx, key) => doc(ctx.db, "users", ctx.user.uid, "plans", key);
const mins = t => { const h = /(\d+)\s*h/i.exec(t || ""), m = /(\d+)\s*m/i.exec(t || ""); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0) || 999; };

// Everything planned for the week containing `d` (used by the Pantry)
export async function weekEntries(ctx, d = new Date()) {
  const s = await getDoc(planRef(ctx, keyOf(mondayOf(d))));
  return s.exists() ? Object.values(s.data().slots || {}).reduce((a, v) => a.concat(v), []) : [];
}

export function mountSous(ctx) {
  const { app, $, esc, toast, db } = ctx;

  async function loadLibrary() {
    try { const s = await getDocs(collection(db, "library")); const l = s.docs.map(d => ({ id: d.id, ...d.data() })); if (l.length) return l; } catch (e) {}
    return LIBRARY;
  }

  async function sous() {
    if (!ctx.isReserve) { app.innerHTML = `<div class="center glass"><span class="badge">GARDE RESERVE</span><h2 style="margin-top:18px">Meet Sous</h2><p>Your weekly meal planner. Pick recipes from the library or your own collection, and Garde puts every ingredient in your Pantry.</p><a class="btn main" href="#/reserve">See Garde Reserve</a></div>`; return; }
    app.innerHTML = `<p class="meta">Loading your week…</p>`;
    let lib, mine;
    try { [lib, mine] = await Promise.all([loadLibrary(), ctx.load()]); } catch (e) { app.innerHTML = `<div class="empty glass"><h3>Couldn't load Sous</h3>Check your connection and refresh.</div>`; return; }
    let week = mondayOf(new Date()), plan = {}, tab = "plan", q = "", tag = "All", maxT = 0, src = "library", day = (new Date().getDay() + 6) % 7, meal = "dinner";
    const tagList = () => ["All", ...new Set(items().reduce((a, r) => a.concat(r.tags || []), []))];
    const loadPlan = async () => { try { const s = await getDoc(planRef(ctx, keyOf(week))); plan = s.exists() ? s.data().slots || {} : {}; } catch (e) { plan = {}; } };
    const save = () => setDoc(planRef(ctx, keyOf(week)), { slots: plan, updatedAt: serverTimestamp() }).catch(() => toast("Couldn't save your plan. Check your connection."));
    const label = () => `${week.toLocaleDateString([], { month: "short", day: "numeric" })} – ${addDays(week, 6).toLocaleDateString([], { month: "short", day: "numeric" })}`;

    const ensure = async item => {
      if (item.src === "mine") return item.id;
      let r = mine.find(x => x.sousId === item.id);
      if (!r) {
        const d = { title: item.title, source: "", time: item.time || "", servings: String(item.servings || ""), image: item.image || "", ingredients: item.ingredients || [], steps: item.steps || [], tags: [...(item.tags || []), "Sous"], notes: "", favorite: false, sousId: item.id, createdAt: serverTimestamp() };
        const ref = await addDoc(ctx.col(), d); r = { id: ref.id, ...d }; mine = [r, ...mine]; ctx.invalidate();
      }
      return r.id;
    };
    const addToPlan = async item => {
      try {
        const rid = await ensure(item), k = `${day}-${meal}`;
        (plan[k] = plan[k] || []).push({ rid, title: item.title, servings: parseInt(item.servings) || 2 });
        await save(); toast(`Added to ${DAYS[day]} ${meal}`); draw();
      } catch (e) { toast("Couldn't add that recipe. Try again."); }
    };
    const items = () => src === "mine"
      ? mine.map(r => ({ ...r, src: "mine", tags: r.tags || [] }))
      : lib.map(r => ({ ...r, src: "library" }));
    const filtered = () => items().filter(r => (tag === "All" || (r.tags || []).includes(tag)) && (!maxT || mins(r.time) <= maxT) && `${r.title} ${(r.tags || []).join(" ")} ${(r.ingredients || []).join(" ")}`.toLowerCase().includes(q));

    const shell = () => {
      const entries = Object.values(plan).reduce((a, v) => a.concat(v), []);
      app.innerHTML = `<h1 class="pg">Sous</h1><p class="lead">Plan your week. Every recipe you add is saved to your recipes and its ingredients go straight into your Pantry.</p>
        <div class="bar"><a class="chip" href="#/sous" data-tab="plan" aria-pressed="${tab === "plan"}">Plan</a><a class="chip" href="#/sous" data-tab="lib" aria-pressed="${tab === "lib"}">Library</a>
          <span class="meta" style="margin-left:auto">${entries.length} meal${entries.length === 1 ? "" : "s"} planned · ${new Set(entries.map(e => e.rid)).size} recipe${new Set(entries.map(e => e.rid)).size === 1 ? "" : "s"}</span><a class="btn" href="#/pantry">Open Pantry</a></div>
        <div id="body"></div>`;
      app.querySelectorAll("[data-tab]").forEach(b => b.onclick = e => { e.preventDefault(); tab = b.dataset.tab; draw(); });
    };

    const drawPlan = () => {
      $("#body").innerHTML = `<div class="bar" style="margin-top:0"><button class="btn" id="pw" aria-label="Previous week">‹</button><b>${label()}</b><button class="btn" id="nw" aria-label="Next week">›</button><button class="btn" id="tw">This week</button><span style="margin-left:auto"></span><button class="btn" id="cp">Copy last week</button><button class="btn danger" id="cl">Clear week</button></div>
      <div class="week">${DAYS.map((d, i) => { const date = addDays(week, i), today = keyOf(date) === keyOf(new Date());
        return `<div class="glass day ${today ? "today" : ""}"><div class="dh"><b>${FULL[i]}</b><small>${date.toLocaleDateString([], { month: "short", day: "numeric" })}</small></div>${MEALS.map(([m, ml]) => `<div class="meal"><span class="aisle">${ml}</span>${(plan[`${i}-${m}`] || []).map((e, n) => `<div class="pe"><a href="#/recipe/${esc(e.rid)}">${esc(e.title)}</a><span class="step" data-k="${i}-${m}" data-n="${n}"><button data-d="-1" aria-label="Fewer servings">−</button><b>${e.servings}</b><button data-d="1" aria-label="More servings">+</button><button data-x aria-label="Remove">×</button></span></div>`).join("")}<button class="addb" data-add="${i}-${m}">+ Add</button></div>`).join("")}</div>`; }).join("")}</div>`;
      const move = n => async () => { week = addDays(week, n); await loadPlan(); draw(); };
      $("#pw").onclick = move(-7); $("#nw").onclick = move(7); $("#tw").onclick = async () => { week = mondayOf(new Date()); await loadPlan(); draw(); };
      $("#cl").onclick = () => { if (Object.keys(plan).length && confirm("Clear everything planned for this week?")) { plan = {}; save(); draw(); } };
      $("#cp").onclick = async () => { try { const s = await getDoc(planRef(ctx, keyOf(addDays(week, -7)))); const prev = s.exists() ? s.data().slots || {} : {}; if (!Object.keys(prev).length) return toast("Nothing was planned last week"); if (Object.keys(plan).length && !confirm("Replace this week's plan with last week's?")) return; plan = JSON.parse(JSON.stringify(prev)); await save(); draw(); } catch (e) { toast("Couldn't copy last week."); } };
      app.querySelectorAll("[data-add]").forEach(b => b.onclick = () => { const [d, m] = b.dataset.add.split("-"); day = +d; meal = m; tab = "lib"; draw(); });
      app.querySelectorAll(".pe .step button").forEach(b => b.onclick = () => {
        const s = b.parentElement, k = s.dataset.k, n = +s.dataset.n;
        if (b.hasAttribute("data-x")) plan[k].splice(n, 1); else plan[k][n].servings = Math.max(1, Math.min(99, plan[k][n].servings + +b.dataset.d));
        if (!plan[k].length) delete plan[k]; save(); draw();
      });
    };

    const drawLib = () => {
      $("#body").innerHTML = `<div class="panel glass" style="padding:20px 24px"><div class="row" style="gap:12px"><b>Planning for</b><select id="sd" style="width:auto" aria-label="Day">${FULL.map((d, i) => `<option value="${i}" ${i === day ? "selected" : ""}>${d}</option>`).join("")}</select><select id="sm" style="width:auto" aria-label="Meal">${MEALS.map(([m, l]) => `<option value="${m}" ${m === meal ? "selected" : ""}>${l}</option>`).join("")}</select><span class="meta">week of ${label()}</span><button class="btn" id="sp" style="margin-left:auto">Surprise me</button></div></div>
        <div class="bar"><input id="sq" type="search" placeholder="Search by recipe, ingredient or tag" aria-label="Search recipes" value="${esc(q)}"><select id="st" style="width:auto" aria-label="Time"><option value="0">Any time</option><option value="20" ${maxT === 20 ? "selected" : ""}>Under 20 min</option><option value="30" ${maxT === 30 ? "selected" : ""}>Under 30 min</option><option value="60" ${maxT === 60 ? "selected" : ""}>Under 1 hour</option></select>
          <button class="chip" data-s="library" aria-pressed="${src === "library"}">Garde library</button><button class="chip" data-s="mine" aria-pressed="${src === "mine"}">My recipes</button></div>
        <div class="bar" style="margin-top:0">${tagList().map(t => `<button class="chip" data-t="${esc(t)}" aria-pressed="${t === tag}">${esc(t)}</button>`).join("")}</div><div class="grid" id="cards"></div>`;
      const cards = () => {
        const f = filtered();
        $("#cards").innerHTML = f.length ? f.map((r, i) => `<div class="glass panel sc"><small class="meta">${esc(r.time || "")}${r.time && r.servings ? " · " : ""}${r.servings ? r.servings + " servings" : ""}</small><h3>${esc(r.title)}</h3>
          <div>${(r.tags || []).slice(0, 3).map(t => `<span class="pill">${esc(t)}</span>`).join("")}</div>
          <details><summary class="meta">${(r.ingredients || []).length} ingredients</summary><ul>${(r.ingredients || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></details>
          <button class="btn main" data-i="${i}">Add to ${DAYS[day]} ${meal}</button></div>`).join("") : `<div class="empty glass" style="grid-column:1/-1"><h3>No recipes match</h3>Try a different search or filter.</div>`;
        app.querySelectorAll("[data-i]").forEach(b => b.onclick = () => { b.disabled = true; addToPlan(f[+b.dataset.i]); });
        $("#sp").onclick = () => { if (f.length) addToPlan(f[Math.floor(Math.random() * f.length)]); else toast("No recipes to pick from"); };
      };
      $("#sd").onchange = e => { day = +e.target.value; cards(); };
      $("#sm").onchange = e => { meal = e.target.value; cards(); };
      $("#sq").oninput = e => { q = e.target.value.toLowerCase(); cards(); };
      $("#st").onchange = e => { maxT = +e.target.value; cards(); };
      app.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { src = b.dataset.s; tag = "All"; drawLib(); });
      app.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { tag = b.dataset.t; drawLib(); });
      cards();
    };
    const draw = () => { shell(); (tab === "plan" ? drawPlan : drawLib)(); };
    await loadPlan(); draw();
  }
  return { sous };
}
