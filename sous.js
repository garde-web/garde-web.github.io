// Sous, the weekly meal planner (Garde Reserve): logic only. Markup is in sous.html.
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
  const { app, $, toast, db, show, fill } = ctx;

  async function loadLibrary() {
    try { const s = await getDocs(collection(db, "library")); const l = s.docs.map(d => ({ id: d.id, ...d.data() })); if (l.length) return l; } catch (e) {}
    return LIBRARY;
  }

  async function sous() {
    if (!ctx.isReserve) { await show("sous#locked"); return; }
    await show("sous#loading");
    let lib, mine;
    try { [lib, mine] = await Promise.all([loadLibrary(), ctx.load()]); } catch (e) { await show("sous#error"); return; }
    let week = mondayOf(new Date()), plan = {}, tab = "plan", q = "", tag = "All", maxT = 0, src = "library", day = (new Date().getDay() + 6) % 7, meal = "dinner";
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
    const items = () => src === "mine" ? mine.map(r => ({ ...r, src: "mine", tags: r.tags || [] })) : lib.map(r => ({ ...r, src: "library" }));
    const tagList = () => ["All", ...new Set(items().reduce((a, r) => a.concat(r.tags || []), []))];
    const filtered = () => items().filter(r => (tag === "All" || (r.tags || []).includes(tag)) && (!maxT || mins(r.time) <= maxT) && `${r.title} ${(r.tags || []).join(" ")} ${(r.ingredients || []).join(" ")}`.toLowerCase().includes(q));

    const drawPlan = async () => {
      const days = DAYS.map((d, i) => { const date = addDays(week, i);
        return { name: FULL[i], date: date.toLocaleDateString([], { month: "short", day: "numeric" }), today: keyOf(date) === keyOf(new Date()),
          meals: MEALS.map(([m, ml]) => { const key = `${i}-${m}`; return { key, label: ml, entries: (plan[key] || []).map((e, n) => ({ n, key, rid: e.rid, title: e.title, servings: e.servings })) }; }) }; });
      if (!(await fill($("#body"), "sous#plan", { label: label(), days }))) return;
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

    const drawLib = async () => {
      const ok = await fill($("#body"), "sous#library", { label: label(), q,
        days: FULL.map((name, i) => ({ i, name, on: i === day })), meals: MEALS.map(([v, l]) => ({ v, label: l, on: v === meal })),
        times: [[0, "Any time"], [20, "Under 20 min"], [30, "Under 30 min"], [60, "Under 1 hour"]].map(([v, l]) => ({ v, label: l, on: v === maxT })),
        srcLibrary: src === "library", srcMine: src === "mine", tags: tagList().map(t => ({ t, on: t === tag })) });
      if (!ok) return;
      const cards = () => {
        const f = filtered();
        fill($("#cards"), "sous#cards", { btn: `Add to ${DAYS[day]} ${meal}`, cards: f.map((r, i) => ({ i, info: [r.time, r.servings && r.servings + " servings"].filter(Boolean).join(" · "), title: r.title, tags: (r.tags || []).slice(0, 3), count: (r.ingredients || []).length, ings: r.ingredients || [] })) })
          .then(() => app.querySelectorAll("[data-i]").forEach(b => b.onclick = () => { b.disabled = true; addToPlan(f[+b.dataset.i]); }));
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

    const draw = async () => {
      const entries = Object.values(plan).reduce((a, v) => a.concat(v), []), recipes = new Set(entries.map(e => e.rid)).size;
      const ok = await show("sous#shell", { planOn: tab === "plan", libOn: tab === "lib", summary: `${entries.length} meal${entries.length === 1 ? "" : "s"} planned · ${recipes} recipe${recipes === 1 ? "" : "s"}` });
      if (!ok) return;
      app.querySelectorAll("[data-tab]").forEach(b => b.onclick = e => { e.preventDefault(); tab = b.dataset.tab; draw(); });
      await (tab === "plan" ? drawPlan : drawLib)();
    };
    await loadPlan(); await draw();
  }
  return { sous };
}
