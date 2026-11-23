// Public shared recipes and the "What can I cook?" finder. Markup is in public.html and fridge.html.
import { collection, addDoc, doc, getDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { parseIng } from "./scale.js";
import { LIBRARY } from "./library.js";

const STAPLE = /\b(salt|pepper|water|oil|ice)\b/;
const NOISE = /\b(fresh|large|small|medium|ripe|chopped|diced|minced|sliced|grated|cooked|frozen|dried|ground|whole|boneless|skinless|to serve|to taste|optional)\b/g;
const sing = w => w.length > 3 ? w.replace(/(ies)$/, "y").replace(/(oes)$/, "o").replace(/(s)$/, "") : w;
const keyOf = line => { const p = parseIng(line), n = (p ? p.name : line).split(",")[0].replace(/\(.*?\)/g, "").toLowerCase().replace(NOISE, " ").replace(/\s+/g, " ").trim(); return n.split(" ").map(sing).join(" "); };
const tokens = text => text.toLowerCase().split(/[,\n;]| and /).map(s => s.replace(NOISE, " ").replace(/\s+/g, " ").trim().split(" ").map(sing).join(" ")).filter(s => s.length >= 3);

export function mountExtras(ctx) {
  const { db, app, $, show, fill, toast } = ctx;

  async function shared(id) {
    let s = null; try { s = await getDoc(doc(db, "shared", id)); } catch (e) {}
    if (!s || !s.exists()) { await show("public#missing"); return; }
    const r = s.data();
    const ok = await show("public", { title: r.title, photo: r.photo || "", image: r.image || "", by: r.by || "a Garde user", ingredients: r.ingredients || [], steps: r.steps || [], notes: r.notes || "",
      meta: [r.time, r.servings && r.servings + " servings"].filter(Boolean).join(" · ") });
    if (!ok) return;
    $("#pr").onclick = () => window.print();
    $("#sv2").onclick = () => { ctx.stashSeed({ title: r.title, time: r.time || "", servings: String(r.servings || ""), image: r.image || "", ingredients: r.ingredients || [], steps: r.steps || [], tags: r.tags || [] }); location.hash = ctx.user ? "#/add" : "#/login"; };
  }

  async function fridge() {
    if (!ctx.isReserve) { await show("fridge#locked"); return; }
    await show("fridge#loading");
    let mine = [], lib = LIBRARY;
    try { mine = await ctx.load(); } catch (e) {}
    try { const s = await getDocs(collection(db, "library")); const l = s.docs.map(d => ({ id: d.id, ...d.data() })); if (l.length) lib = l; } catch (e) {}
    if (!(await show("fridge"))) return;
    let shown = [];
    const run = () => {
      const have = tokens($("#have").value), staples = $("#staples").checked;
      if (!have.length) { fill($("#res"), "fridge#results", { none: true, cards: [] }); return; }
      const have2 = new Set(mine.map(r => r.sousId).filter(Boolean));
      const pool = [...mine.map(r => ({ ...r, own: true })), ...lib.filter(r => !have2.has(r.id)).map(r => ({ ...r, own: false }))];
      const scored = pool.map(r => {
        const ings = (r.ingredients || []).map(x => ({ key: keyOf(x), line: x })).filter(x => x.key);
        const mine2 = (ctx.have ? ctx.have() : []), covered = x => (staples && STAPLE.test(x.key)) || mine2.some(h => h && x.key.includes(h)) || have.some(h => x.key.includes(h) || h.includes(x.key.split(" ").pop()) && x.key.split(" ").pop().length >= 3);
        const missing = ings.filter(x => !covered(x));
        return { r, total: ings.length, have: ings.length - missing.length, missing: missing.map(x => x.key) };
      }).filter(x => x.total >= 2 && x.have / x.total >= 0.5 && x.have >= 1).sort((a, b) => b.have / b.total - a.have / a.total || a.missing.length - b.missing.length).slice(0, 12);
      shown = scored;
      fill($("#res"), "fridge#results", { none: false, cards: scored.map((x, n) => ({ n, title: x.r.title, own: x.r.own, id: x.r.id, have: x.have, total: x.total, pct: Math.round(x.have / x.total * 100), ready: x.missing.length === 0, missing: x.missing.slice(0, 6).join(", ") })) })
        .then(() => app.querySelectorAll("[data-save]").forEach(b => b.onclick = async () => {
          const it = shown[+b.dataset.save].r; b.disabled = true;
          try { const d = { title: it.title, source: "", time: it.time || "", servings: String(it.servings || ""), image: it.image || "", ingredients: it.ingredients || [], steps: it.steps || [], tags: [...(it.tags || []), "Sous"], notes: "", favorite: false, sousId: it.id, createdAt: serverTimestamp() }; const ref = await addDoc(ctx.col(), d); ctx.invalidate(); location.hash = "#/recipe/" + ref.id; }
          catch (e) { b.disabled = false; toast("Couldn't save that recipe."); }
        }));
    };
    $("#go").onclick = run; $("#staples").onchange = run; $("#have").onkeydown = e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run(); };
  }

  return { shared, fridge };
}
