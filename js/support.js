// Support tickets, the staff console and the Garde Reserve page: logic only. Markup is in pages/support.html, ticket.html, staff-*.html and reserve.html.
import { collection, addDoc, doc, getDoc, getDocs, updateDoc, deleteDoc, setDoc, query, orderBy, where, limit, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { LIBRARY } from "./library.js";

const CATS = ["Account", "Recipes", "Importing", "Photo upload", "Pantry", "Sous", "Garde Reserve", "Other"];
const HINT = { Importing: "Include the link you tried to import and what happened.", "Photo upload": "Tell us what the photo was and what came out wrong.", Pantry: "Which recipes were selected, and what looked wrong on the list?", Sous: "Which day or recipe were you planning?", "Garde Reserve": "Tell us what you need. Billing questions are welcome too.", Account: "Which email is your account, and what are you trying to do?" };
const REPLIES = [
  ["Thanks for reaching out", "Hi {name}, thanks for contacting Garde. "],
  ["Need more details", "Hi {name}, could you send the link or a screenshot of what you're seeing, and what you expected to happen? That will help us track it down."],
  ["Fixed, please retry", "Hi {name}, we've fixed this. Please refresh the page (Ctrl+Shift+R) and try again. Let us know if it still doesn't work."],
  ["Closing the loop", "Hi {name}, we're closing this ticket since it looks resolved. Reply here any time to reopen it."]
];
const LABEL = { user: { open: "Awaiting our reply", pending: "We replied", closed: "Closed" }, staff: { open: "Needs reply", pending: "Waiting on customer", closed: "Closed" } };
const DAYMS = 864e5;

export const reserveActive = d => d.exists() && !(d.data().until > 0 && d.data().until < Date.now());
export const when = ts => { const d = ts && ts.toDate && ts.toDate(); return d ? d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "just now"; };
const ago = ts => { const d = ts && ts.toDate && ts.toDate(); if (!d) return "just now"; const s = Math.max(0, (Date.now() - d) / 1000); return s < 60 ? "just now" : s < 3600 ? Math.floor(s / 60) + "m ago" : s < 86400 ? Math.floor(s / 3600) + "h ago" : Math.floor(s / 86400) + "d ago"; };
const secs = t => (t && t.seconds) || 0;
const code = id => "GRD-" + id.slice(0, 6).toUpperCase();
const untilText = u => u > 0 ? "until " + new Date(u).toLocaleDateString() : "with no end date";

export function mountSupport(ctx) {
  const { db, app, $, toast, show, fill } = ctx, stamp = serverTimestamp, me = () => ctx.user;
  const audit = (action, target, detail = "") => addDoc(collection(db, "audit"), { at: stamp(), by: me().uid, byName: me().displayName || me().email || "", action, target, detail }).catch(() => {});
  const grant = async (uid, months, name) => { try { await setDoc(doc(db, "reserve", uid), { since: stamp(), by: me().uid, until: months ? Date.now() + months * 30 * DAYMS : 0 }); audit("granted Reserve to", name || uid, months ? months + " month(s)" : "no end date"); toast("Reserve granted"); } catch (e) { toast("Couldn't update. Check your Firestore rules."); } };
  const revoke = async (uid, name) => { try { await deleteDoc(doc(db, "reserve", uid)); audit("revoked Reserve from", name || uid); toast("Reserve revoked"); } catch (e) { toast("Couldn't update. Check your Firestore rules."); } };
  const cmp = (a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0) || secs(a.updatedAt) - secs(b.updatedAt);
  // Ticket rows for pages/shared.html
  const rows = (list, sv) => list.map(t => ({ id: t.id, unread: !sv && !!t.unread, priority: sv && !!t.priority, subject: t.subject, status: t.status, label: LABEL[sv ? "staff" : "user"][t.status] || t.status,
    meta: sv ? `${t.name || t.email} · ${t.category} · ${t.assignee ? t.assignee.name : "Unassigned"} · ${t.status === "open" ? "waiting " : ""}${ago(t.updatedAt)}` : `${code(t.id)} · ${t.category} · ${ago(t.updatedAt)}` }));

  async function createTicket(subject, category, text) {
    const t = stamp();
    const ref = await addDoc(collection(db, "tickets"), { uid: me().uid, email: me().email || "", name: me().displayName || "", subject, category, status: "open", priority: ctx.isReserve, lastFrom: "user", unread: false, ua: navigator.userAgent.slice(0, 160), createdAt: t, updatedAt: t });
    await addDoc(collection(db, "tickets", ref.id, "messages"), { from: "user", uid: me().uid, name: me().displayName || "You", text, createdAt: t });
    return ref.id;
  }

  // ---------- Customer: new ticket + my tickets ----------
  async function support() {
    if (!me()) { await show("support#signin"); return; }
    if (!(await show("support", { reserve: ctx.isReserve, cats: CATS }))) return;
    const hint = () => { $("#msg").placeholder = HINT[$("#cat").value] || "What happened, and what did you expect?"; };
    hint(); $("#cat").onchange = hint;
    const faq = await ctx.faqItems(), words = s => new Set(s.toLowerCase().match(/[a-z]{4,}/g) || []);
    $("#sub").oninput = () => {
      const w = words($("#sub").value + " " + $("#cat").value);
      const m = w.size ? faq.map(([q, a]) => [q, a, [...words(q + " " + a)].filter(x => w.has(x)).length]).filter(x => x[2] > 0).sort((a, b) => b[2] - a[2]).slice(0, 2) : [];
      fill($("#sg"), "support#suggest", { items: m.map(([q, a]) => ({ q, a })) });
    };
    $("#send").onclick = async e => {
      const sub = $("#sub").value.trim(), msg = $("#msg").value.trim();
      if (!sub || !msg) return toast("Add a subject and a message");
      e.target.disabled = true;
      try { const id = await createTicket(sub, $("#cat").value, msg); toast("Ticket sent"); location.hash = "#/ticket/" + id; }
      catch (err) { e.target.disabled = false; toast("Couldn't send. Please try again."); }
    };
    ctx.setUnsub(onSnapshot(query(collection(db, "tickets"), where("uid", "==", me().uid)), s => {
      const ts = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => secs(b.updatedAt) - secs(a.updatedAt));
      fill($("#mine"), "support#mine", { list: rows(ts, false) });
    }, () => { fill($("#mine"), "support#mine-error", {}); }));
  }

  // ---------- Ticket conversation (customer and staff) ----------
  function ticket(id) {
    let t = null, msgs = [], notes = [], rsv = null, others = [], macros = [], marked = false;
    const off = []; ctx.setUnsub(() => off.forEach(f => f()));
    const draw = async () => {
      if (!t) return;
      const mine = t.uid === me().uid, sv = ctx.isStaff && !mine, first = (t.name || "").split(" ")[0] || "there";
      const keep = $("#rep") ? $("#rep").value : "", nk = $("#nt") ? $("#nt").value : "", foc = document.activeElement && document.activeElement.id;
      const ML = REPLIES.map(r => ({ title: r[0], text: r[1] })).concat(macros);
      const setStatus = s => updateDoc(doc(db, "tickets", id), { status: s, updatedAt: stamp() }).then(() => { if (sv) audit("set " + code(id) + " to", s); }).catch(() => toast("Couldn't update the ticket."));
      const ok = await show("ticket", {
        back: "#/" + (sv ? "staff/tickets" : "support"), subject: t.subject, priority: t.priority, status: t.status, statusLabel: LABEL[sv ? "staff" : "user"][t.status] || t.status,
        code: code(id), category: t.category, opened: when(t.createdAt), sv,
        messages: msgs.map(m => ({ cls: m.from === "staff" ? "staff" : "user", who: m.from === "staff" ? "Garde team" : (m.name || "You"), when: when(m.createdAt), text: m.text })),
        showRate: !sv && t.status === "closed" && !t.rating, thanks: !sv && t.status === "closed" && !!t.rating,
        replyLabel: t.status === "closed" ? "This ticket is closed. Replying will reopen it." : "Reply",
        macros: ML.map((m, i) => ({ i, title: m.title })), canClose: !sv && t.status !== "closed",
        side: sv ? { name: t.name, email: t.email, uid: t.uid, reserve: !!rsv, reserveText: untilText(rsv ? rsv.until || 0 : 0),
          statuses: ["open", "pending", "closed"].map(s => ({ v: s, label: LABEL.staff[s], on: s === t.status })),
          assignee: t.assignee ? t.assignee.name : "no one", mine: !!(t.assignee && t.assignee.uid === me().uid), ua: t.ua || "",
          notes: notes.map(n => ({ id: n.id, by: n.byName, when: when(n.at), text: n.text })),
          others: others.map(o => ({ id: o.id, subject: o.subject, status: o.status, label: LABEL.staff[o.status] })) } : null
      });
      if (!ok) return;
      $("#rep").value = keep; if (foc === "rep") $("#rep").focus();
      if ($("#nt")) { $("#nt").value = nk; if (foc === "nt") $("#nt").focus(); }
      const send = async close => {
        const text = $("#rep").value.trim(); if (!text) return;
        $("#go").disabled = true;
        try {
          await addDoc(collection(db, "tickets", id, "messages"), { from: sv ? "staff" : "user", uid: me().uid, name: me().displayName || "", text, createdAt: stamp() });
          const u = sv ? { status: close ? "closed" : "pending", lastFrom: "staff", unread: true, updatedAt: stamp() } : { status: "open", lastFrom: "user", unread: false, updatedAt: stamp() };
          if (sv && !t.assignee) u.assignee = { uid: me().uid, name: me().displayName || me().email || "Staff" };
          await updateDoc(doc(db, "tickets", id), u);
          if (sv && close) audit("closed", code(id));
        } catch (e) { toast("Couldn't send your reply."); $("#go").disabled = false; }
      };
      $("#go").onclick = () => send(false);
      if ($("#gc")) $("#gc").onclick = () => send(true);
      if ($("#cls")) $("#cls").onclick = () => setStatus("closed");
      if ($("#mac")) $("#mac").onchange = e => { const m = ML[e.target.value]; if (!m) return; const ta = $("#rep"); ta.value = (ta.value ? ta.value + "\n\n" : "") + m.text.replace(/\{name\}/g, first).replace(/\{ticket\}/g, code(id)); e.target.value = ""; ta.focus(); };
      app.querySelectorAll("[data-rate]").forEach(b => b.onclick = () => updateDoc(doc(db, "tickets", id), { rating: b.dataset.rate }).catch(() => toast("Couldn't save feedback.")));
      if ($("#sts")) $("#sts").onchange = e => setStatus(e.target.value);
      if ($("#as")) $("#as").onclick = () => updateDoc(doc(db, "tickets", id), { assignee: { uid: me().uid, name: me().displayName || me().email || "Staff" } }).then(() => audit("assigned " + code(id) + " to", "themselves"));
      if ($("#un")) $("#un").onclick = () => updateDoc(doc(db, "tickets", id), { assignee: null });
      if ($("#gr")) $("#gr").onclick = () => grant(t.uid, +$("#gm").value, t.name);
      if ($("#rv")) $("#rv").onclick = () => revoke(t.uid, t.name);
      if ($("#an")) $("#an").onclick = () => { const v = $("#nt").value.trim(); if (!v) return; $("#nt").value = ""; addDoc(collection(db, "tickets", id, "notes"), { text: v, by: me().uid, byName: me().displayName || me().email || "Staff", at: stamp() }).catch(() => toast("Couldn't save the note.")); };
      app.querySelectorAll("[data-dn]").forEach(b => b.onclick = () => deleteDoc(doc(db, "tickets", id, "notes", b.dataset.dn)));
    };
    off.push(onSnapshot(doc(db, "tickets", id), s => {
      if (!s.exists()) { show("ticket#notfound"); return; }
      const isFirst = !t; t = { id, ...s.data() };
      if (isFirst && ctx.isStaff && t.uid !== me().uid) {
        off.push(onSnapshot(doc(db, "reserve", t.uid), x => { rsv = reserveActive(x) ? x.data() : null; draw(); }, () => {}));
        off.push(onSnapshot(collection(db, "tickets", id, "notes"), x => { notes = x.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => secs(a.at) - secs(b.at)); draw(); }, () => {}));
        getDocs(query(collection(db, "tickets"), where("uid", "==", t.uid))).then(x => { others = x.docs.filter(d => d.id !== id).map(d => ({ id: d.id, ...d.data() })).slice(0, 5); draw(); }).catch(() => {});
        getDocs(collection(db, "macros")).then(x => { macros = x.docs.map(d => d.data()); draw(); }).catch(() => {});
      }
      if (t.uid === me().uid && t.unread && !marked) { marked = true; updateDoc(doc(db, "tickets", id), { unread: false }).catch(() => {}); }
      draw();
    }, () => { show("ticket#noaccess"); }));
    off.push(onSnapshot(query(collection(db, "tickets", id, "messages"), orderBy("createdAt")), s => { msgs = s.docs.map(d => d.data()); draw(); }, () => {}));
  }

  // ---------- Staff console ----------
  async function staff(tab) {
    if (!ctx.isStaff) { await show("staff#denied"); return; }
    tab = tab || "overview";
    const list = [["overview", "Overview"], ["tickets", "Tickets"], ["members", "Members"], ["library", "Library"], ["replies", "Replies"]].concat(ctx.isAdmin ? [["settings", "Settings"]] : []);
    const tabs = list.map(([k, label]) => ({ k, label, on: k === tab }));
    await ({ overview, tickets, members, library, replies, settings }[tab] || overview)(tabs);
  }

  async function overview(tabs) {
    if (!(await show("staff-overview", { tabs }))) return;
    let all = [], mem = null;
    const draw = () => {
      const open = all.filter(t => t.status === "open"), pend = all.filter(t => t.status === "pending");
      const wk = all.filter(t => t.status === "closed" && secs(t.updatedAt) * 1000 > Date.now() - 7 * DAYMS), rated = all.filter(t => t.rating), yes = rated.filter(t => t.rating === "yes").length;
      const cards = [[open.length, "Need a reply"], [open.filter(t => !t.assignee).length, "Unassigned"], [pend.length, "Waiting on customer"], [wk.length, "Closed this week"], [rated.length ? Math.round(yes / rated.length * 100) + "%" : "–", "Found helpful"], [mem ? mem.total : "…", "Members"], [mem ? mem.reserve : "…", "On Reserve"]].map(([n, label]) => ({ n, label }));
      fill($("#kpi"), "staff-overview#kpi", { cards });
      fill($("#na"), "staff-overview#na", { list: rows(open.slice().sort(cmp).slice(0, 6), true) });
    };
    const off = [
      onSnapshot(collection(db, "tickets"), s => { all = s.docs.map(d => ({ id: d.id, ...d.data() })); draw(); }, () => toast("Couldn't load tickets. Publish the updated Firestore rules.")),
      onSnapshot(query(collection(db, "audit"), orderBy("at", "desc"), limit(12)), s => {
        fill($("#ac"), "staff-overview#activity", { items: s.docs.map(d => { const a = d.data(); return { ago: ago(a.at), who: a.byName, action: a.action, target: a.target, detail: a.detail }; }) });
      }, () => { fill($("#ac"), "staff-overview#activity-error", {}); })
    ];
    ctx.setUnsub(() => off.forEach(f => f()));
    Promise.all([getDocs(collection(db, "profiles")), getDocs(collection(db, "reserve"))]).then(([p, r]) => { mem = { total: p.size, reserve: r.docs.filter(d => !(d.data().until > 0 && d.data().until < Date.now())).length }; draw(); }).catch(() => {});
  }

  async function tickets(tabs) {
    let all = [], f = "open", q = "";
    const F = [["open", "Needs reply"], ["pending", "Waiting"], ["closed", "Closed"], ["mine", "Mine"], ["unassigned", "Unassigned"], ["all", "All"]];
    if (!(await show("staff-tickets", { tabs, filters: F.map(([k, label]) => ({ k, label, on: k === f })) }))) return;
    const draw = () => {
      const ok = t => f === "all" || (f === "mine" ? t.assignee && t.assignee.uid === me().uid && t.status !== "closed" : f === "unassigned" ? !t.assignee && t.status !== "closed" : t.status === f);
      const list = all.filter(t => ok(t) && `${t.subject} ${t.name} ${t.email} ${code(t.id)}`.toLowerCase().includes(q)).sort((a, b) => f === "closed" || f === "all" ? secs(b.updatedAt) - secs(a.updatedAt) : cmp(a, b));
      fill($("#tl"), "staff-tickets#list", { list: rows(list, true) });
    };
    $("#q").oninput = e => { q = e.target.value.toLowerCase(); draw(); };
    app.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { f = b.dataset.f; app.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); });
    ctx.setUnsub(onSnapshot(collection(db, "tickets"), s => { all = s.docs.map(d => ({ id: d.id, ...d.data() })); draw(); }, () => toast("Couldn't load tickets. Publish the updated Firestore rules.")));
  }

  async function members(tabs) {
    if (!(await show("staff-members", { tabs, admin: ctx.isAdmin }))) return;
    let all = [], rs = {}, team = {}, q = "", ro = false, so = false;
    const nm = id => (all.find(m => m.id === id) || {}).name || id;
    const act = (a, id) => {
      if (a === "grant") grant(id, +$("#gm").value, nm(id));
      else if (a === "revoke") revoke(id, nm(id));
      else if (a === "team") setDoc(doc(db, "staff", id), { role: "agent", by: me().uid, at: stamp() }).then(() => { audit("made staff", nm(id)); toast("Added to the team"); }).catch(() => toast("Couldn't update the team."));
      else if (a === "unteam") deleteDoc(doc(db, "staff", id)).then(() => { audit("removed from staff", nm(id)); toast("Removed from the team"); }).catch(() => toast("Couldn't update the team."));
    };
    const draw = async () => {
      const list = all.filter(m => (!ro || rs[m.id]) && (!so || team[m.id]) && `${m.name} ${m.email}`.toLowerCase().includes(q)).sort((a, b) => secs(b.lastSeen) - secs(a.lastSeen));
      const ok = await fill($("#ml"), "staff-members#list", { members: list.map(m => { const r = rs[m.id], role = team[m.id];
        return { id: m.id, name: m.name || m.email, email: m.email, seen: when(m.lastSeen), reserve: !!r, until: r ? untilText(r.until || 0) : "", role: role ? (role === "admin" ? "ADMIN" : "STAFF") : "",
          reserveClass: r ? "" : "main", reserveAct: r ? "revoke" : "grant", reserveLabel: r ? "Revoke" : "Grant Reserve",
          canTeam: ctx.isAdmin && m.id !== me().uid && role !== "admin", teamAct: role ? "unteam" : "team", teamLabel: role ? "Remove staff" : "Make staff" }; }) });
      if (ok) app.querySelectorAll("[data-act]").forEach(b => b.onclick = () => act(b.dataset.act, b.dataset.id));
    };
    $("#mq").oninput = e => { q = e.target.value.toLowerCase(); draw(); };
    $("#ro").onclick = e => { ro = !ro; e.target.setAttribute("aria-pressed", ro); draw(); };
    $("#so").onclick = e => { so = !so; e.target.setAttribute("aria-pressed", so); draw(); };
    $("#gu").onclick = () => { const v = $("#uid").value.trim(); if (v.length < 10) return toast("Paste a full account ID"); grant(v, +$("#gm").value, v); $("#uid").value = ""; };
    const off = [
      onSnapshot(collection(db, "profiles"), s => { all = s.docs.map(d => ({ id: d.id, ...d.data() })); draw(); }, () => toast("Couldn't load members. Publish the updated Firestore rules.")),
      onSnapshot(collection(db, "reserve"), s => { rs = {}; s.docs.forEach(d => { if (reserveActive({ exists: () => true, data: () => d.data() })) rs[d.id] = d.data(); }); draw(); }, () => {}),
      onSnapshot(collection(db, "staff"), s => { team = {}; s.docs.forEach(d => { team[d.id] = d.data().role || "agent"; }); draw(); }, () => {})
    ];
    ctx.setUnsub(() => off.forEach(f => f()));
  }

  async function library(tabs) {
    let items = [], ed = null;
    const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "r" + Date.now();
    const lines = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);
    const draw = async () => {
      if (!ed) {
        const ok = await show("staff-library#list", { tabs, starter: LIBRARY.length, items: items.slice().sort((a, b) => a.title.localeCompare(b.title)).map(r => ({ id: r.id, title: r.title, time: r.time || "", servings: r.servings || "?", tags: (r.tags || []).join(", ") })) });
        if (!ok) return;
        $("#new").onclick = () => { ed = { title: "", time: "", servings: "", tags: [], image: "", ingredients: [], steps: [] }; draw(); };
        $("#seed").onclick = async () => { const have = new Set(items.map(i => i.id)); try { await Promise.all(LIBRARY.filter(r => !have.has(r.id)).map(r => setDoc(doc(db, "library", r.id), { ...r, createdAt: stamp() }))); audit("added starter recipes to", "the library"); toast("Starter recipes added"); } catch (e) { toast("Couldn't add them. Check your Firestore rules."); } };
        app.querySelectorAll("[data-e]").forEach(b => b.onclick = () => { ed = { ...items.find(i => i.id === b.dataset.e) }; draw(); });
        app.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { const r = items.find(i => i.id === b.dataset.d); if (confirm(`Delete "${r.title}" from the library?`)) deleteDoc(doc(db, "library", r.id)).then(() => audit("deleted from the library:", r.title)); });
        return;
      }
      const ok = await show("staff-library#editor", { tabs, id: ed.id, title: ed.title, time: ed.time, servings: ed.servings, ingredients: (ed.ingredients || []).join("\n"), steps: (ed.steps || []).join("\n"), tags: (ed.tags || []).join(", "), image: ed.image || "" });
      if (!ok) return;
      const cur = () => ({ ...ed, title: $("#lt").value.trim(), time: $("#ltm").value.trim(), servings: parseInt($("#lsv").value) || 0, ingredients: lines($("#lin").value), steps: lines($("#lst").value), tags: $("#ltg").value.split(",").map(x => x.trim()).filter(Boolean), image: $("#lim").value.trim() });
      $("#lc").onclick = () => { ed = null; draw(); };
      $("#ib").onclick = async () => { const u = $("#iu").value.trim(); if (!u) return; $("#is").textContent = "Importing…"; try { const x = await ctx.importUrl(u), c = cur(); ed = { ...c, title: x.title || c.title, time: x.time || c.time, servings: x.servings || c.servings, ingredients: x.ingredients.length ? x.ingredients : c.ingredients, steps: x.steps.length ? x.steps : c.steps, tags: x.tags && x.tags.length ? x.tags : c.tags, image: x.image || c.image }; draw(); } catch (e) { $("#is").textContent = "Couldn't import that page. Enter the recipe by hand."; } };
      $("#ls").onclick = async () => { const d = cur(); if (!d.title || d.ingredients.length < 2) return toast("Add a title and at least two ingredients"); const id = d.id || slug(d.title); delete d.id; try { await setDoc(doc(db, "library", id), { ...d, createdAt: d.createdAt || stamp() }); audit(ed.id ? "edited library recipe" : "added library recipe", d.title); toast("Recipe saved"); ed = null; draw(); } catch (e) { toast("Couldn't save. Check your Firestore rules."); } };
    };
    await draw();
    ctx.setUnsub(onSnapshot(collection(db, "library"), s => { items = s.docs.map(d => ({ id: d.id, ...d.data() })); if (!ed) draw(); }, () => toast("Couldn't load the library. Publish the updated Firestore rules.")));
  }

  async function replies(tabs) {
    let items = [];
    if (!(await show("staff-replies", { tabs, builtin: REPLIES.map(r => ({ title: r[0], text: r[1] })) }))) return;
    const draw = async () => { if (await fill($("#rl"), "staff-replies#list", { items })) app.querySelectorAll("[data-d]").forEach(b => b.onclick = () => deleteDoc(doc(db, "macros", b.dataset.d))); };
    $("#ra").onclick = () => { const t = $("#rt").value.trim(), x = $("#rx").value.trim(); if (!t || !x) return toast("Add a title and the reply text"); addDoc(collection(db, "macros"), { title: t, text: x, by: me().uid }).then(() => { $("#rt").value = ""; $("#rx").value = ""; toast("Reply saved"); }).catch(() => toast("Couldn't save. Check your Firestore rules.")); };
    ctx.setUnsub(onSnapshot(collection(db, "macros"), s => { items = s.docs.map(d => ({ id: d.id, ...d.data() })); draw(); }, () => { fill($("#rl"), "staff-replies#error", {}); }));
  }

  async function settings(tabs) {
    if (!ctx.isAdmin) return overview(tabs);
    if (!(await show("staff-settings", { tabs }))) return;
    getDoc(doc(db, "config", "banner")).then(s => { if (s.exists()) { $("#bt").value = s.data().text || ""; $("#bo").checked = !!s.data().on; } }).catch(() => {});
    $("#bs").onclick = () => setDoc(doc(db, "config", "banner"), { text: $("#bt").value.trim(), on: $("#bo").checked, by: me().uid, at: stamp() }).then(() => { audit("updated", "the announcement banner"); ctx.refreshBanner(); toast("Banner published"); }).catch(() => toast("Couldn't publish. Check your Firestore rules."));
  }

  // ---------- Garde Reserve page ----------
  async function reserve() {
    if (!(await show("reserve", { signedOut: !me(), member: ctx.isReserve, limit: ctx.FREE_LIMIT }))) return;
    if ($("#req")) $("#req").onclick = async e => { e.target.disabled = true; try { location.hash = "#/ticket/" + await createTicket("Garde Reserve access request", "Garde Reserve", "I'd like to request access to Garde Reserve."); } catch (err) { e.target.disabled = false; toast("Couldn't send your request."); } };
  }

  return { support, ticket, staff, reserve, createTicket };
}
