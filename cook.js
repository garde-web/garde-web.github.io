// Cook mode: one big step at a time, screen stays awake, timers are found in the step text. Markup is in cook.html.
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { scaleLine, convertLine, convertText } from "./scale.js";

const TIMER = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;
export const findTimers = text => [...String(text).matchAll(TIMER)].map(m => {
  const n = parseFloat(m[2] || m[1]), u = m[3].toLowerCase(), sec = /^h/.test(u) ? n * 3600 : /^m/.test(u) ? n * 60 : n;
  return { label: m[0].replace(/\s+/g, " "), sec: Math.round(sec) };
}).filter(t => t.sec > 0 && t.sec <= 86400);
const clock = s => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };

export function mountCook(ctx) {
  const { db, $, show, fill, toast, lsGet, lsSet, app } = ctx;
  async function cook(id) {
    const s = await getDoc(doc(db, "users", ctx.user.uid, "recipes", id));
    if (!s.exists()) { await show("cook#notfound"); return; }
    const r = s.data(), base = parseInt(r.servings) || 0, steps = (r.steps || []).length ? r.steps : ["This recipe has no steps yet."];
    let i = 0, units = lsGet("garde.units", "original");
    const cur = lsGet("garde.serv", {})[id] || base;
    const ings = () => (r.ingredients || []).map(x => convertLine(scaleLine(x, base ? cur / base : 1), units));
    const unitList = () => [["original", "Original"], ["metric", "Metric"], ["imperial", "US"]].map(([v, label]) => ({ v, label, on: v === units }));
    if (!(await show("cook", { id, title: r.title, ingredients: ings(), units: unitList() }))) return;
    document.body.classList.add("cooking");

    let lock = null, timers = [], tick = null;
    const getLock = async () => { try { lock = await navigator.wakeLock.request("screen"); } catch (e) {} };
    getLock();
    const onVis = () => { if (document.visibilityState === "visible") getLock(); };
    document.addEventListener("visibilitychange", onVis);
    const beep = () => { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = 0.2; o.start(); setTimeout(() => { o.stop(); a.close(); }, 700); } catch (e) {} try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch (e) {} };
    const drawTimers = () => fill($("#timers"), "cook#timers", { list: timers.map(t => ({ id: t.id, label: t.label, left: t.done ? "Done!" : clock(Math.ceil((t.end - Date.now()) / 1000)), done: t.done })) })
      .then(() => app.querySelectorAll("[data-x]").forEach(b => b.onclick = () => { timers = timers.filter(t => t.id !== +b.dataset.x); drawTimers(); }));
    const ensureTick = () => { if (tick) return; tick = setInterval(() => {
      let fired = false; timers.forEach(t => { if (!t.done && Date.now() >= t.end) { t.done = true; fired = true; toast(`Timer done: ${t.label}`); } });
      if (fired) beep(); if (timers.length) drawTimers(); }, 1000); };

    const draw = () => {
      $("#cn").textContent = `Step ${i + 1} of ${steps.length}`;
      $("#ct").textContent = convertText(steps[i], units);
      $("#cp").disabled = i === 0; $("#cx").textContent = i === steps.length - 1 ? "Done ✓" : "Next →";
      $("#cd").innerHTML = steps.map((_, n) => `<i class="${n === i ? "on" : n < i ? "past" : ""}"></i>`).join("");
      const found = findTimers(steps[i]);
      fill($("#ctimers"), "cook#timerbtns", { list: found.map((t, n) => ({ n, label: t.label })) })
        .then(() => app.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { const t = found[+b.dataset.t]; timers.push({ id: Date.now() + Math.random(), label: t.label, end: Date.now() + t.sec * 1000, done: false }); ensureTick(); drawTimers(); }));
    };
    const next = async () => {
      if (i < steps.length - 1) { i++; draw(); return; }
      if (confirm("Nice work! Mark this recipe as made?")) { try { await updateDoc(doc(db, "users", ctx.user.uid, "recipes", id), { cooked: (r.cooked || 0) + 1, lastCooked: Date.now() }); ctx.invalidate(); toast("Logged. Enjoy your meal!"); } catch (e) {} }
      location.hash = "#/recipe/" + id;
    };
    const prev = () => { if (i > 0) { i--; draw(); } };
    $("#cx").onclick = next; $("#cp").onclick = prev;
    $("#ci").onclick = () => { const a = $("#cing"); a.hidden = !a.hidden; };
    app.querySelectorAll("[data-u]").forEach(b => b.onclick = () => {
      units = b.dataset.u; lsSet("garde.units", units);
      app.querySelectorAll("[data-u]").forEach(x => x.setAttribute("aria-pressed", x === b));
      fill($("#cinglist"), "cook#ingredients", { items: ings() }); draw();
    });
    const key = e => { if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); } else if (e.key === "ArrowLeft") prev(); else if (e.key === "Escape") location.hash = "#/recipe/" + id; };
    document.addEventListener("keydown", key);
    let x0 = null; const wrap = $(".cookwrap");
    wrap.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
    wrap.addEventListener("touchend", e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (dx < -60) next(); else if (dx > 60) prev(); }, { passive: true });
    ctx.setUnsub(() => { document.body.classList.remove("cooking"); document.removeEventListener("keydown", key); document.removeEventListener("visibilitychange", onVis); clearInterval(tick); try { lock && lock.release(); } catch (e) {} });
    draw();
  }
  return { cook };
}
