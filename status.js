// The public Status page and its admin controls. Markup is in status.html and staff-status.html.
import { collection, doc, addDoc, setDoc, updateDoc, deleteDoc, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DEFAULTS = [["web", "Website"], ["auth", "Sign in"], ["import", "Recipe import"], ["scan", "Photo scanning"], ["sous", "Sous planner"], ["support", "Support desk"]].map(([id, name]) => ({ id, name, state: "operational" }));
const STATE = { operational: "Operational", degraded: "Degraded", outage: "Outage", maintenance: "Maintenance" };
const ISTATE = { scheduled: "Scheduled", investigating: "Investigating", identified: "Identified", monitoring: "Monitoring", resolved: "Resolved" };
const IMPACT = { minor: "Minor", major: "Major", maintenance: "Maintenance" };
const IMPACT_STATE = { minor: "degraded", major: "outage", maintenance: "maintenance" };
const RANK = { operational: 0, maintenance: 1, degraded: 2, outage: 3 };
const stamp = ms => new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const names = (comps, ids) => (ids || []).map(id => (comps.find(c => c.id === id) || {}).name).filter(Boolean).join(", ");

// One summary used by the status page and the site-wide notice bar
export function summarize(comps, incs) {
  const bad = comps.filter(c => c.state !== "operational"), active = incs.filter(i => i.state !== "resolved");
  const worst = bad.reduce((m, c) => Math.max(m, RANK[c.state] || 0), 0), list = bad.map(c => c.name).join(", ");
  if (worst === 3) return { level: "outage", headline: "Some services are down", sub: list, bar: `Some services are down: ${list}.` };
  if (worst === 2) return { level: "degraded", headline: "Some services are degraded", sub: list, bar: `Some services are degraded: ${list}.` };
  if (worst === 1) return { level: "maint", headline: "Maintenance in progress", sub: list, bar: `Maintenance in progress: ${list}.` };
  if (active.length) return { level: "degraded", headline: "We're looking into an issue", sub: active[0].title, bar: `We're looking into an issue: ${active[0].title}.` };
  return { level: "ok", headline: "All systems operational", sub: "Everything is running normally.", bar: "" };
}

export function mountStatus(ctx) {
  const { db, app, $, toast, show, fill } = ctx;
  const readIncs = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
  const audit = (a, t) => { try { ctx.audit && ctx.audit(a, t); } catch (e) {} };

  // A thin notice at the top of every page while anything is wrong
  function watchBar() {
    let comps = DEFAULTS, incs = [];
    const draw = () => fill($("#statusbar"), "layout#statusbar", { text: summarize(comps, incs).bar }, true);
    onSnapshot(doc(db, "status", "components"), s => { if (s.exists() && (s.data().items || []).length) comps = s.data().items; draw(); }, () => {});
    onSnapshot(query(collection(db, "incidents"), orderBy("started", "desc"), limit(5)), s => { incs = readIncs(s); draw(); }, () => {});
  }

  // ---------- Public page ----------
  async function status() {
    if (!(await show("status"))) return;
    let comps = DEFAULTS, incs = [];
    const fmt = i => ({ id: i.id, title: i.title, impact: i.impact, impactLabel: IMPACT[i.impact] || i.impact, when: stamp(i.started), affects: names(comps, i.affects),
      updates: (i.updates || []).slice().reverse().map(u => ({ stateLabel: ISTATE[u.state] || u.state, when: stamp(u.at), text: u.text })) });
    const draw = () => {
      fill($("#overall"), "status#overall", summarize(comps, incs));
      fill($("#comps"), "status#comps", { items: comps.map(c => ({ name: c.name, state: c.state, label: STATE[c.state] || c.state })) });
      fill($("#active"), "status#incidents", { list: incs.filter(i => i.state !== "resolved").map(fmt), empty: "No active incidents." });
      fill($("#past"), "status#incidents", { list: incs.filter(i => i.state === "resolved").slice(0, 10).map(fmt), empty: "No past incidents." });
    };
    const off = [
      onSnapshot(doc(db, "status", "components"), s => { if (s.exists() && (s.data().items || []).length) comps = s.data().items; draw(); }, () => draw()),
      onSnapshot(query(collection(db, "incidents"), orderBy("started", "desc"), limit(30)), s => { incs = readIncs(s); draw(); }, () => draw())
    ];
    ctx.setUnsub(() => off.forEach(f => f()));
  }

  // ---------- Admin controls (Staff > Status) ----------
  async function admin(tabs) {
    if (!ctx.isAdmin) { await show("staff#denied"); return; }
    if (!(await show("staff-status", { tabs }))) return;
    let saved = DEFAULTS, edit = DEFAULTS.map(c => ({ ...c })), incs = [], loaded = false;
    const stateOpts = cur => Object.keys(STATE).map(v => ({ v, label: STATE[v], on: v === cur }));
    const iStateOpts = cur => Object.keys(ISTATE).map(v => ({ v, label: ISTATE[v], on: v === cur }));
    const writeComps = items => setDoc(doc(db, "status", "components"), { items, updatedAt: Date.now() });

    const drawComps = () => fill($("#clist"), "staff-status#comps", { comps: edit.map((c, i) => ({ i, name: c.name, states: stateOpts(c.state) })) }).then(() => {
      app.querySelectorAll("[data-n]").forEach(x => x.oninput = () => { edit[+x.dataset.n].name = x.value; });
      app.querySelectorAll("[data-s]").forEach(x => x.onchange = () => { edit[+x.dataset.s].state = x.value; });
      app.querySelectorAll("[data-rm]").forEach(x => x.onclick = () => { edit.splice(+x.dataset.rm, 1); drawComps(); });
    });
    const drawAff = () => fill($("#iaff"), "staff-status#aff", { comps: saved.map(c => ({ id: c.id, name: c.name })) });
    const drawIncs = () => {
      const row = i => ({ id: i.id, title: i.title, impact: i.impact, impactLabel: IMPACT[i.impact] || i.impact, when: stamp(i.started), affects: names(saved, i.affects), states: iStateOpts(i.state),
        updates: (i.updates || []).slice().reverse().map(u => ({ stateLabel: ISTATE[u.state] || u.state, when: stamp(u.at), text: u.text })) });
      fill($("#open"), "staff-status#open", { list: incs.filter(i => i.state !== "resolved").map(row) }).then(bindOpen);
      fill($("#done"), "staff-status#done", { list: incs.filter(i => i.state === "resolved").map(row) }).then(() => app.querySelectorAll("[data-del]").forEach(b => b.onclick = () => removeInc(b.dataset.del)));
    };
    const removeInc = async id => { const i = incs.find(x => x.id === id); if (!i || !confirm(`Delete the incident "${i.title}"?`)) return; try { await deleteDoc(doc(db, "incidents", id)); audit("deleted incident", i.title); } catch (e) { toast("Couldn't delete. Check your Firestore rules."); } };
    const restore = async inc => {
      const stillAffected = new Set(incs.filter(x => x.id !== inc.id && x.state !== "resolved").flatMap(x => x.affects || []));
      await writeComps(saved.map(c => (inc.affects || []).includes(c.id) && !stillAffected.has(c.id) ? { ...c, state: "operational" } : c));
    };
    const bindOpen = () => {
      app.querySelectorAll("[data-up]").forEach(b => b.onclick = async () => {
        const id = b.dataset.up, inc = incs.find(x => x.id === id), text = app.querySelector(`[data-ut="${id}"]`).value.trim(), state = app.querySelector(`[data-us="${id}"]`).value;
        if (!text) return toast("Write an update first");
        try {
          await updateDoc(doc(db, "incidents", id), { state, updates: [...(inc.updates || []), { state, text, at: Date.now() }], resolvedAt: state === "resolved" ? Date.now() : 0 });
          if (state === "resolved" && confirm("Mark the affected services as operational again?")) await restore(inc);
          audit(`posted "${ISTATE[state]}" on incident`, inc.title); toast("Update posted");
        } catch (e) { toast("Couldn't post. Check your Firestore rules."); }
      });
      app.querySelectorAll("[data-del]").forEach(b => b.onclick = () => removeInc(b.dataset.del));
    };

    $("#cadd").onclick = () => { edit.push({ id: "s" + Date.now().toString(36), name: "New service", state: "operational" }); drawComps(); };
    $("#csave").onclick = async () => {
      const items = edit.map(c => ({ id: c.id, name: c.name.trim() || "Untitled", state: c.state }));
      try { await writeComps(items); audit("updated", "service statuses"); toast("Services saved"); } catch (e) { toast("Couldn't save. Check your Firestore rules."); }
    };
    $("#icreate").onclick = async () => {
      const title = $("#it").value.trim(), text = $("#im").value.trim(); if (!title || !text) return toast("Add a title and a message");
      const affects = [...app.querySelectorAll("[data-a]:checked")].map(x => x.dataset.a), impact = $("#ii").value, state = $("#is").value;
      try {
        await addDoc(collection(db, "incidents"), { title, impact, state, affects, started: Date.now(), updates: [{ state, text, at: Date.now() }], resolvedAt: state === "resolved" ? Date.now() : 0 });
        if ($("#iauto").checked && state !== "resolved" && state !== "scheduled" && affects.length) {
          const to = IMPACT_STATE[impact];
          await writeComps(saved.map(c => affects.includes(c.id) && RANK[to] > (RANK[c.state] || 0) ? { ...c, state: to } : c));
        }
        audit("opened incident", title); toast("Incident published");
        $("#it").value = ""; $("#im").value = ""; app.querySelectorAll("[data-a]").forEach(x => { x.checked = false; });
      } catch (e) { toast("Couldn't publish. Check your Firestore rules."); }
    };
    const off = [
      onSnapshot(doc(db, "status", "components"), s => { if (s.exists() && (s.data().items || []).length) saved = s.data().items; if (!loaded) { edit = saved.map(c => ({ ...c })); loaded = true; drawComps(); } drawAff(); drawIncs(); }, () => { drawComps(); drawAff(); }),
      onSnapshot(query(collection(db, "incidents"), orderBy("started", "desc"), limit(40)), s => { incs = readIncs(s); drawIncs(); }, () => toast("Couldn't load incidents. Publish the updated Firestore rules."))
    ];
    ctx.setUnsub(() => off.forEach(f => f()));
    drawComps(); drawAff();
  }

  return { status, admin, watchBar };
}
