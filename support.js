import { collection, addDoc, doc, getDoc, getDocs, updateDoc, deleteDoc, setDoc, query, orderBy, where, limit, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { FAQ } from "./pages.js";
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
  const { db, app, $, esc, toast } = ctx, stamp = serverTimestamp, me = () => ctx.user;
  const pill = (s, sv) => `<span class="st ${s}">${LABEL[sv ? "staff" : "user"][s] || s}</span>`;
  const audit = (action, target, detail = "") => addDoc(collection(db, "audit"), { at: stamp(), by: me().uid, byName: me().displayName || me().email || "", action, target, detail }).catch(() => {});
  const grant = async (uid, months, name) => { try { await setDoc(doc(db, "reserve", uid), { since: stamp(), by: me().uid, until: months ? Date.now() + months * 30 * DAYMS : 0 }); audit("granted Reserve to", name || uid, months ? months + " month(s)" : "no end date"); toast("Reserve granted"); } catch (e) { toast("Couldn't update. Check your Firestore rules."); } };
  const revoke = async (uid, name) => { try { await deleteDoc(doc(db, "reserve", uid)); audit("revoked Reserve from", name || uid); toast("Reserve revoked"); } catch (e) { toast("Couldn't update. Check your Firestore rules."); } };
  const cmp = (a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0) || secs(a.updatedAt) - secs(b.updatedAt);
  const trow = t => `<a class="trow glass" href="#/ticket/${t.id}"><b>${t.priority ? '<span class="badge">RESERVE</span> ' : ""}${esc(t.subject)}</b>${pill(t.status, true)}<small>${esc(t.name || t.email)} · ${esc(t.category)} · ${t.assignee ? esc(t.assignee.name) : "Unassigned"} · ${t.status === "open" ? "waiting " : ""}${ago(t.updatedAt)}</small></a>`;

  async function createTicket(subject, category, text) {
    const t = stamp();
    const ref = await addDoc(collection(db, "tickets"), { uid: me().uid, email: me().email || "", name: me().displayName || "", subject, category, status: "open", priority: ctx.isReserve, lastFrom: "user", unread: false, ua: navigator.userAgent.slice(0, 160), createdAt: t, updatedAt: t });
    await addDoc(collection(db, "tickets", ref.id, "messages"), { from: "user", uid: me().uid, name: me().displayName || "You", text, createdAt: t });
    return ref.id;
  }

  // ---------- Customer: new ticket + my tickets ----------
  function support() {
    if (!me()) { app.innerHTML = `<div class="center glass"><h2>Support</h2><p>Sign in to open a ticket and follow replies from our team.</p><a class="btn main" href="#/login">Sign in</a></div>`; return; }
    app.innerHTML = `<h1 class="pg">Support</h1><p class="lead">Tell us what's going on and our team will reply in your ticket.${ctx.isReserve ? " As a Reserve member, your tickets go to the front of the line." : ""}</p>
    <div class="detail"><div class="panel glass"><h3>New ticket</h3>
      <label for="cat">Topic</label><select id="cat">${CATS.map(c => `<option>${c}</option>`).join("")}</select>
      <label for="sub">Subject</label><input id="sub" maxlength="120" autocomplete="off"><div id="sg"></div>
      <label for="msg">Message</label><textarea id="msg" maxlength="4000"></textarea>
      <div class="row" style="margin-top:24px"><button class="btn main" id="send">Send ticket</button></div></div>
    <div><h3 style="margin-bottom:16px">Your tickets</h3><div id="mine"><p class="meta">Loading…</p></div></div></div>`;
    const hint = () => { $("#msg").placeholder = HINT[$("#cat").value] || "What happened, and what did you expect?"; };
    hint(); $("#cat").onchange = hint;
    const words = s => new Set(s.toLowerCase().match(/[a-z]{4,}/g) || []);
    $("#sub").oninput = () => {
      const w = words($("#sub").value + " " + $("#cat").value);
      const m = w.size ? FAQ.map(([q, a]) => [q, a, [...words(q + " " + a)].filter(x => w.has(x)).length]).filter(x => x[2] > 0).sort((a, b) => b[2] - a[2]).slice(0, 2) : [];
      $("#sg").innerHTML = m.length ? `<p class="meta" style="margin-top:14px">These might already answer it:</p>` + m.map(([q, a]) => `<details class="glass sug"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("") : "";
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
      $("#mine").innerHTML = ts.length ? ts.map(t => `<a class="trow glass" href="#/ticket/${t.id}"><b>${t.unread ? '<i class="dot" title="New reply"></i>' : ""}${esc(t.subject)}</b>${pill(t.status)}<small>${code(t.id)} · ${esc(t.category)} · ${ago(t.updatedAt)}</small></a>`).join("") : `<div class="empty glass"><h3>No tickets yet</h3>When you open one, it shows up here.</div>`;
    }, () => { $("#mine").innerHTML = `<p class="meta">Couldn't load your tickets.</p>`; }));
  }

  // ---------- Ticket conversation (customer and staff) ----------
  function ticket(id) {
    app.innerHTML = `<p class="meta">Loading…</p>`;
    let t = null, msgs = [], notes = [], rsv = null, others = [], macros = [], marked = false;
    const off = []; ctx.setUnsub(() => off.forEach(f => f()));
    const draw = () => {
      if (!t) return;
      const mine = t.uid === me().uid, sv = ctx.isStaff && !mine, first = (t.name || "").split(" ")[0] || "there";
      const keep = $("#rep") ? $("#rep").value : "", nk = $("#nt") ? $("#nt").value : "", foc = document.activeElement && document.activeElement.id;
      const ML = REPLIES.map(r => ({ title: r[0], text: r[1] })).concat(macros);
      const setStatus = s => updateDoc(doc(db, "tickets", id), { status: s, updatedAt: stamp() }).then(() => { if (sv) audit("set " + code(id) + " to", s); }).catch(() => toast("Couldn't update the ticket."));
      const bubbles = msgs.map(m => `<div class="msg ${m.from === "staff" ? "staff" : "user"}"><small>${m.from === "staff" ? "Garde team" : esc(m.name || "You")} · ${when(m.createdAt)}</small>${esc(m.text)}</div>`).join("");
      const rate = !sv && t.status === "closed" ? (t.rating ? `<p class="meta">Thanks for the feedback.</p>` : `<div class="row" style="margin-bottom:18px"><span class="meta">Was this helpful?</span><button class="btn" data-rate="yes">Yes</button><button class="btn" data-rate="no">No</button></div>`) : "";
      const reply = `<div class="panel glass"><label for="rep" style="margin-top:0">${t.status === "closed" ? "This ticket is closed. Replying will reopen it." : "Reply"}</label>
        ${sv ? `<select id="mac" aria-label="Saved replies" style="margin-bottom:12px"><option value="">Insert a saved reply…</option>${ML.map((m, i) => `<option value="${i}">${esc(m.title)}</option>`).join("")}</select>` : ""}
        <textarea id="rep" maxlength="4000"></textarea>
        <div class="row" style="margin-top:20px"><button class="btn main" id="go">Send reply</button>${sv ? `<button class="btn" id="gc">Send &amp; close</button>` : t.status !== "closed" ? `<button class="btn" id="cls">Close ticket</button>` : ""}</div></div>`;
      const side = sv ? `<aside class="side">
        <div class="panel glass"><h3>Customer</h3><p class="meta">${esc(t.name)}<br>${esc(t.email)}<br>${rsv ? `<span class="badge">RESERVE</span> ${untilText(rsv.until || 0)}` : "Free plan"}</p><small class="meta">ID <code>${esc(t.uid)}</code></small>
          <div class="row" style="margin-top:16px">${rsv ? `<button class="btn" id="rv">Revoke Reserve</button>` : `<select id="gm" style="width:auto" aria-label="Reserve length"><option value="0">No end date</option><option value="1">1 month</option><option value="3">3 months</option><option value="12">12 months</option></select><button class="btn main" id="gr">Grant Reserve</button>`}</div></div>
        <div class="panel glass"><h3>Ticket</h3><label for="sts" style="margin-top:0">Status</label><select id="sts">${["open", "pending", "closed"].map(s => `<option value="${s}" ${s === t.status ? "selected" : ""}>${LABEL.staff[s]}</option>`).join("")}</select>
          <p class="meta" style="margin-top:14px">Assigned to <b>${t.assignee ? esc(t.assignee.name) : "no one"}</b></p><div class="row" style="margin-top:8px">${t.assignee && t.assignee.uid === me().uid ? `<button class="btn" id="un">Unassign</button>` : `<button class="btn" id="as">Assign to me</button>`}</div>
          <small class="meta" style="display:block;margin-top:14px">${code(id)} · ${esc(t.category)}<br>${esc(t.ua || "")}</small></div>
        <div class="panel glass"><h3>Internal notes</h3>${notes.map(n => `<div class="note"><small>${esc(n.byName)} · ${when(n.at)} <button class="x" data-dn="${n.id}" aria-label="Delete note">×</button></small>${esc(n.text)}</div>`).join("") || `<p class="meta">Only staff can see notes.</p>`}
          <textarea id="nt" style="min-height:70px;margin-top:12px" placeholder="Add a private note"></textarea><div class="row" style="margin-top:12px"><button class="btn" id="an">Add note</button></div></div>
        ${others.length ? `<div class="panel glass"><h3>Their other tickets</h3>${others.map(o => `<a style="display:block;margin-bottom:8px" href="#/ticket/${o.id}">${esc(o.subject)} ${pill(o.status, true)}</a>`).join("")}</div>` : ""}</aside>` : "";
      app.innerHTML = `<a class="meta" href="#/${sv ? "staff/tickets" : "support"}">← Back</a>
        <div class="row" style="justify-content:space-between;margin:16px 0 6px"><h1 class="pg" style="margin:0">${esc(t.subject)}</h1><div>${t.priority ? '<span class="badge">RESERVE</span> ' : ""}${pill(t.status, sv)}</div></div>
        <p class="meta">${code(id)} · ${esc(t.category)} · Opened ${when(t.createdAt)}</p>
        <div class="${sv ? "tk" : ""}"><div><div class="thread" aria-live="polite">${bubbles}</div>${rate}${reply}</div>${side}</div>`;
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
      if (!s.exists()) { app.innerHTML = `<div class="empty glass"><h3>Ticket not found</h3><a class="btn" href="#/support">Back to support</a></div>`; return; }
      const isFirst = !t; t = { id, ...s.data() };
      if (isFirst && ctx.isStaff && t.uid !== me().uid) {
        off.push(onSnapshot(doc(db, "reserve", t.uid), x => { rsv = reserveActive(x) ? x.data() : null; draw(); }, () => {}));
        off.push(onSnapshot(collection(db, "tickets", id, "notes"), x => { notes = x.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => secs(a.at) - secs(b.at)); draw(); }, () => {}));
        getDocs(query(collection(db, "tickets"), where("uid", "==", t.uid))).then(x => { others = x.docs.filter(d => d.id !== id).map(d => ({ id: d.id, ...d.data() })).slice(0, 5); draw(); }).catch(() => {});
        getDocs(collection(db, "macros")).then(x => { macros = x.docs.map(d => d.data()); draw(); }).catch(() => {});
      }
      if (t.uid === me().uid && t.unread && !marked) { marked = true; updateDoc(doc(db, "tickets", id), { unread: false }).catch(() => {}); }
      draw();
    }, () => { app.innerHTML = `<div class="empty glass"><h3>No access</h3>You can only open your own tickets.<br><a class="btn" href="#/support">Back to support</a></div>`; }));
    off.push(onSnapshot(query(collection(db, "tickets", id, "messages"), orderBy("createdAt")), s => { msgs = s.docs.map(d => d.data()); draw(); }, () => {}));
  }

  // ---------- Staff console ----------
  function staff(tab) {
    if (!ctx.isStaff) { app.innerHTML = `<div class="empty glass"><h3>Staff only</h3>This page is for authorised Garde accounts.<br><a class="btn" href="#/dashboard">Back to my recipes</a></div>`; return; }
    tab = tab || "overview";
    const tabs = [["overview", "Overview"], ["tickets", "Tickets"], ["members", "Members"], ["library", "Library"], ["replies", "Replies"]].concat(ctx.isAdmin ? [["settings", "Settings"]] : []);
    const head = `<h1 class="pg">Staff</h1><div class="bar" style="margin-top:0">${tabs.map(([k, l]) => `<a class="chip" href="#/staff/${k}" aria-pressed="${k === tab}">${l}</a>`).join("")}</div>`;
    ({ overview, tickets, members, library, replies, settings }[tab] || overview)(head);
  }

  function overview(head) {
    app.innerHTML = head + `<div class="stats" id="kpi"></div><div class="detail"><div><h3 style="margin-bottom:16px">Needs attention</h3><div id="na"></div></div><div><h3 style="margin-bottom:16px">Recent activity</h3><div class="panel glass" id="ac"><p class="meta">Loading…</p></div></div></div>`;
    let all = [], mem = null;
    const draw = () => {
      const open = all.filter(t => t.status === "open"), pend = all.filter(t => t.status === "pending");
      const wk = all.filter(t => t.status === "closed" && secs(t.updatedAt) * 1000 > Date.now() - 7 * DAYMS), rated = all.filter(t => t.rating), yes = rated.filter(t => t.rating === "yes").length;
      const k = [[open.length, "Need a reply"], [open.filter(t => !t.assignee).length, "Unassigned"], [pend.length, "Waiting on customer"], [wk.length, "Closed this week"], [rated.length ? Math.round(yes / rated.length * 100) + "%" : "–", "Found helpful"], [mem ? mem.total : "…", "Members"], [mem ? mem.reserve : "…", "On Reserve"]];
      $("#kpi").innerHTML = k.map(([n, l]) => `<div class="glass"><b>${n}</b>${l}</div>`).join("");
      const na = open.slice().sort(cmp).slice(0, 6);
      $("#na").innerHTML = na.length ? na.map(trow).join("") : `<div class="empty glass"><h3>All caught up</h3>No tickets are waiting for a reply.</div>`;
    };
    const off = [
      onSnapshot(collection(db, "tickets"), s => { all = s.docs.map(d => ({ id: d.id, ...d.data() })); draw(); }, () => toast("Couldn't load tickets. Publish the updated Firestore rules.")),
      onSnapshot(query(collection(db, "audit"), orderBy("at", "desc"), limit(12)), s => {
        $("#ac").innerHTML = s.docs.length ? s.docs.map(d => { const a = d.data(); return `<div class="note"><small>${ago(a.at)}</small><b>${esc(a.byName)}</b> ${esc(a.action)} ${esc(a.target)}${a.detail ? ` <span class="meta">(${esc(a.detail)})</span>` : ""}</div>`; }).join("") : `<p class="meta">Nothing yet. Granting Reserve, closing tickets and similar actions show up here.</p>`;
      }, () => { $("#ac").innerHTML = `<p class="meta">Couldn't load activity.</p>`; })
    ];
    ctx.setUnsub(() => off.forEach(f => f()));
    Promise.all([getDocs(collection(db, "profiles")), getDocs(collection(db, "reserve"))]).then(([p, r]) => { mem = { total: p.size, reserve: r.docs.filter(d => !(d.data().until > 0 && d.data().until < Date.now())).length }; draw(); }).catch(() => {});
  }

  function tickets(head) {
    let all = [], f = "open", q = "";
    const F = [["open", "Needs reply"], ["pending", "Waiting"], ["closed", "Closed"], ["mine", "Mine"], ["unassigned", "Unassigned"], ["all", "All"]];
    app.innerHTML = head + `<div class="bar"><input id="q" type="search" placeholder="Search subject, name, email or ticket code" aria-label="Search tickets">${F.map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${k === f}">${l}</button>`).join("")}</div><div id="tl"></div>`;
    const draw = () => {
      const ok = t => f === "all" || (f === "mine" ? t.assignee && t.assignee.uid === me().uid && t.status !== "closed" : f === "unassigned" ? !t.assignee && t.status !== "closed" : t.status === f);
      const list = all.filter(t => ok(t) && `${t.subject} ${t.name} ${t.email} ${code(t.id)}`.toLowerCase().includes(q)).sort((a, b) => f === "closed" || f === "all" ? secs(b.updatedAt) - secs(a.updatedAt) : cmp(a, b));
      $("#tl").innerHTML = list.length ? list.map(trow).join("") : `<div class="empty glass"><h3>Nothing here</h3>No tickets match this view.</div>`;
    };
    $("#q").oninput = e => { q = e.target.value.toLowerCase(); draw(); };
    app.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { f = b.dataset.f; app.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); });
    ctx.setUnsub(onSnapshot(collection(db, "tickets"), s => { all = s.docs.map(d => ({ id: d.id, ...d.data() })); draw(); }, () => toast("Couldn't load tickets. Publish the updated Firestore rules.")));
  }

  function members(head) {
    app.innerHTML = head + `<p class="lead">Everyone who has signed in. Grant or revoke Garde Reserve${ctx.isAdmin ? " and manage the team" : ""}.</p>
    <div class="bar"><input id="mq" type="search" placeholder="Search by name or email" aria-label="Search members"><button class="chip" id="ro" aria-pressed="false">Reserve only</button><button class="chip" id="so" aria-pressed="false">Team only</button>
      <select id="gm" style="width:auto" aria-label="Reserve length"><option value="0">Grant: no end date</option><option value="1">Grant: 1 month</option><option value="3">Grant: 3 months</option><option value="12">Grant: 12 months</option></select></div><div id="ml"></div>
    <div class="panel glass" style="margin-top:28px"><h3>Add by account ID</h3><p class="meta">For someone who hasn't signed in since members were added. They can copy their ID from Settings.</p>
      <div class="row nowrap" style="margin-top:16px"><input id="uid" placeholder="Account ID" aria-label="Account ID"><button class="btn main" id="gu">Grant Reserve</button></div></div>`;
    let all = [], rs = {}, team = {}, q = "", ro = false, so = false;
    const draw = () => {
      const list = all.filter(m => (!ro || rs[m.id]) && (!so || team[m.id]) && `${m.name} ${m.email}`.toLowerCase().includes(q)).sort((a, b) => secs(b.lastSeen) - secs(a.lastSeen));
      $("#ml").innerHTML = list.length ? list.map(m => { const r = rs[m.id], role = team[m.id];
        return `<div class="trow glass"><b>${esc(m.name || m.email)} ${r ? '<span class="badge">RESERVE</span>' : ""}${role ? `<span class="badge dark">${role === "admin" ? "ADMIN" : "STAFF"}</span>` : ""}</b>
        <span class="row" style="flex-wrap:nowrap"><button class="btn ${r ? "" : "main"}" data-${r ? "r" : "g"}="${esc(m.id)}">${r ? "Revoke" : "Grant Reserve"}</button>${ctx.isAdmin && m.id !== me().uid && role !== "admin" ? `<button class="btn" data-${role ? "u" : "t"}="${esc(m.id)}">${role ? "Remove staff" : "Make staff"}</button>` : ""}</span>
        <small>${esc(m.email)} · last seen ${when(m.lastSeen)}${r ? " · Reserve " + untilText(r.until || 0) : ""}</small></div>`; }).join("") : `<div class="empty glass"><h3>No members found</h3>People appear here after they sign in to Garde.</div>`;
      const nm = id => (all.find(m => m.id === id) || {}).name || id;
      app.querySelectorAll("[data-g]").forEach(b => b.onclick = () => grant(b.dataset.g, +$("#gm").value, nm(b.dataset.g)));
      app.querySelectorAll("[data-r]").forEach(b => b.onclick = () => revoke(b.dataset.r, nm(b.dataset.r)));
      app.querySelectorAll("[data-t]").forEach(b => b.onclick = () => setDoc(doc(db, "staff", b.dataset.t), { role: "agent", by: me().uid, at: stamp() }).then(() => { audit("made staff", nm(b.dataset.t)); toast("Added to the team"); }).catch(() => toast("Couldn't update the team.")));
      app.querySelectorAll("[data-u]").forEach(b => b.onclick = () => deleteDoc(doc(db, "staff", b.dataset.u)).then(() => { audit("removed from staff", nm(b.dataset.u)); toast("Removed from the team"); }).catch(() => toast("Couldn't update the team.")));
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

  function library(head) {
    let items = [], ed = null;
    const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "r" + Date.now();
    const lines = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);
    const draw = () => {
      if (!ed) {
        app.innerHTML = head + `<p class="lead">The recipes Reserve members can browse in Sous. Changes show up for members right away.</p>
          <div class="bar"><button class="btn main" id="new">Add recipe</button><button class="btn" id="seed">Add the ${LIBRARY.length} starter recipes</button></div>
          ${items.length ? items.slice().sort((a, b) => a.title.localeCompare(b.title)).map(r => `<div class="trow glass"><b>${esc(r.title)}</b><span class="row" style="flex-wrap:nowrap"><button class="btn" data-e="${esc(r.id)}">Edit</button><button class="btn danger" data-d="${esc(r.id)}">Delete</button></span><small>${esc(r.time || "")} · ${r.servings || "?"} servings · ${esc((r.tags || []).join(", "))}</small></div>`).join("") : `<div class="empty glass"><h3>The library is empty</h3>Members currently see the built-in starter recipes. Add the starter set here to edit them, or add your own.</div>`}`;
        $("#new").onclick = () => { ed = { title: "", time: "", servings: "", tags: [], image: "", ingredients: [], steps: [] }; draw(); };
        $("#seed").onclick = async () => { const have = new Set(items.map(i => i.id)); try { await Promise.all(LIBRARY.filter(r => !have.has(r.id)).map(r => setDoc(doc(db, "library", r.id), { ...r, createdAt: stamp() }))); audit("added starter recipes to", "the library"); toast("Starter recipes added"); } catch (e) { toast("Couldn't add them. Check your Firestore rules."); } };
        app.querySelectorAll("[data-e]").forEach(b => b.onclick = () => { ed = { ...items.find(i => i.id === b.dataset.e) }; draw(); });
        app.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { const r = items.find(i => i.id === b.dataset.d); if (confirm(`Delete "${r.title}" from the library?`)) deleteDoc(doc(db, "library", r.id)).then(() => audit("deleted from the library:", r.title)); });
        return;
      }
      app.innerHTML = head + `<div class="panel glass"><h3>${ed.id ? "Edit recipe" : "New library recipe"}</h3>
        <label for="iu" style="margin-top:0">Import from a link (optional)</label><div class="row nowrap"><input id="iu" type="url" placeholder="https://…"><button class="btn" id="ib">Import</button></div><p class="status" id="is"></p>
        <label for="lt">Title</label><input id="lt" value="${esc(ed.title)}">
        <div class="two"><div><label for="ltm">Time</label><input id="ltm" value="${esc(ed.time)}" placeholder="30 min"></div><div><label for="lsv">Servings</label><input id="lsv" value="${esc(ed.servings)}" inputmode="numeric"></div></div>
        <label for="lin">Ingredients (one per line)</label><textarea id="lin">${esc((ed.ingredients || []).join("\n"))}</textarea>
        <label for="lst">Steps (one per line)</label><textarea id="lst">${esc((ed.steps || []).join("\n"))}</textarea>
        <div class="two"><div><label for="ltg">Tags (comma separated)</label><input id="ltg" value="${esc((ed.tags || []).join(", "))}" placeholder="Dinner, Vegetarian, Quick"></div><div><label for="lim">Photo link</label><input id="lim" value="${esc(ed.image || "")}"></div></div>
        <div class="row" style="margin-top:28px"><button class="btn main" id="ls">Save recipe</button><button class="btn" id="lc">Cancel</button></div></div>`;
      const cur = () => ({ ...ed, title: $("#lt").value.trim(), time: $("#ltm").value.trim(), servings: parseInt($("#lsv").value) || 0, ingredients: lines($("#lin").value), steps: lines($("#lst").value), tags: $("#ltg").value.split(",").map(x => x.trim()).filter(Boolean), image: $("#lim").value.trim() });
      $("#lc").onclick = () => { ed = null; draw(); };
      $("#ib").onclick = async () => { const u = $("#iu").value.trim(); if (!u) return; $("#is").textContent = "Importing…"; try { const x = await ctx.importUrl(u); ed = { ...cur(), title: x.title || cur().title, time: x.time || cur().time, servings: x.servings || cur().servings, ingredients: x.ingredients.length ? x.ingredients : cur().ingredients, steps: x.steps.length ? x.steps : cur().steps, tags: x.tags && x.tags.length ? x.tags : cur().tags, image: x.image || cur().image }; draw(); } catch (e) { $("#is").textContent = "Couldn't import that page. Enter the recipe by hand."; } };
      $("#ls").onclick = async () => { const d = cur(); if (!d.title || d.ingredients.length < 2) return toast("Add a title and at least two ingredients"); const id = d.id || slug(d.title); delete d.id; try { await setDoc(doc(db, "library", id), { ...d, createdAt: d.createdAt || stamp() }); audit(ed.id ? "edited library recipe" : "added library recipe", d.title); toast("Recipe saved"); ed = null; draw(); } catch (e) { toast("Couldn't save. Check your Firestore rules."); } };
    };
    draw();
    ctx.setUnsub(onSnapshot(collection(db, "library"), s => { items = s.docs.map(d => ({ id: d.id, ...d.data() })); if (!ed) draw(); }, () => toast("Couldn't load the library. Publish the updated Firestore rules.")));
  }

  function replies(head) {
    let items = [];
    app.innerHTML = head + `<p class="lead">Saved replies appear in the ticket reply box. Use {name} for the customer's first name and {ticket} for the ticket code.</p>
      <div class="panel glass"><h3>New saved reply</h3><label for="rt" style="margin-top:0">Title</label><input id="rt" maxlength="60"><label for="rx">Text</label><textarea id="rx"></textarea><div class="row" style="margin-top:20px"><button class="btn main" id="ra">Save reply</button></div></div>
      <h3 style="margin:30px 0 16px">Your team's replies</h3><div id="rl"></div>
      <h3 style="margin:30px 0 16px">Built in</h3>${REPLIES.map(r => `<div class="panel glass"><b>${esc(r[0])}</b><p class="meta" style="margin-top:8px">${esc(r[1])}</p></div>`).join("")}`;
    const draw = () => { $("#rl").innerHTML = items.length ? items.map(m => `<div class="panel glass"><div class="row" style="justify-content:space-between"><b>${esc(m.title)}</b><button class="btn danger" data-d="${esc(m.id)}">Delete</button></div><p class="meta" style="margin-top:8px;white-space:pre-wrap">${esc(m.text)}</p></div>`).join("") : `<p class="meta">None yet.</p>`; app.querySelectorAll("[data-d]").forEach(b => b.onclick = () => deleteDoc(doc(db, "macros", b.dataset.d))); };
    $("#ra").onclick = () => { const t = $("#rt").value.trim(), x = $("#rx").value.trim(); if (!t || !x) return toast("Add a title and the reply text"); addDoc(collection(db, "macros"), { title: t, text: x, by: me().uid }).then(() => { $("#rt").value = ""; $("#rx").value = ""; toast("Reply saved"); }).catch(() => toast("Couldn't save. Check your Firestore rules.")); };
    ctx.setUnsub(onSnapshot(collection(db, "macros"), s => { items = s.docs.map(d => ({ id: d.id, ...d.data() })); draw(); }, () => { $("#rl").innerHTML = `<p class="meta">Couldn't load replies.</p>`; }));
  }

  function settings(head) {
    if (!ctx.isAdmin) return overview(head);
    app.innerHTML = head + `<div class="panel glass"><h3>Announcement banner</h3><p class="meta">Shown at the top of every page for all visitors.</p>
      <label for="bt">Message</label><input id="bt" maxlength="200" placeholder="Sous now has a weekly planner!"><label class="chk" style="margin-top:18px"><input type="checkbox" id="bo"> Show the banner</label>
      <div class="row" style="margin-top:22px"><button class="btn main" id="bs">Publish</button></div></div>`;
    getDoc(doc(db, "config", "banner")).then(s => { if (s.exists()) { $("#bt").value = s.data().text || ""; $("#bo").checked = !!s.data().on; } }).catch(() => {});
    $("#bs").onclick = () => setDoc(doc(db, "config", "banner"), { text: $("#bt").value.trim(), on: $("#bo").checked, by: me().uid, at: stamp() }).then(() => { audit("updated", "the announcement banner"); ctx.refreshBanner(); toast("Banner published"); }).catch(() => toast("Couldn't publish. Check your Firestore rules."));
  }

  // ---------- Garde Reserve page ----------
  function reserve() {
    const perks = [["Unlimited recipes", `Free accounts hold ${ctx.FREE_LIMIT} recipes. Reserve has no limit.`], ["Sous meal planner", "Plan your week from the recipe library or your own recipes. Every ingredient lands in your Pantry."], ["Priority support", "Your tickets are pinned to the top of our queue."]];
    app.innerHTML = `<section class="band" style="margin-top:0"><div><span class="badge" style="background:#fff;color:#17493a">$9.99 / MONTH</span><h1 style="margin:18px 0 .3em">Garde Reserve</h1><p class="lead" style="color:#bdbdbd">For people who cook a lot and want their recipe collection to keep up.</p><div class="row" id="cta"></div></div>
      <ul>${perks.map(([h]) => `<li>${h}</li>`).join("")}<li>Reserve badge on your account</li></ul></section>
      <div class="grid3">${perks.map(([h, p]) => `<div class="glass"><h3>${h}</h3><p>${p}</p></div>`).join("")}</div>
      <p class="meta" style="text-align:center;margin-top:36px">Reserve is rolling out now. Request access and our team will set you up in your ticket.</p>`;
    const cta = $("#cta");
    if (!me()) cta.innerHTML = `<a class="btn main big" href="#/login">Sign in to request access</a>`;
    else if (ctx.isReserve) cta.innerHTML = `<span class="badge" style="background:#fff;color:#17493a">YOU'RE A RESERVE MEMBER</span><a class="btn" href="#/sous">Open Sous</a><a class="btn" href="#/support">Priority support</a>`;
    else { cta.innerHTML = `<button class="btn main big" id="req">Request access</button>`; $("#req").onclick = async e => { e.target.disabled = true; try { location.hash = "#/ticket/" + await createTicket("Garde Reserve access request", "Garde Reserve", "I'd like to request access to Garde Reserve."); } catch (err) { e.target.disabled = false; toast("Couldn't send your request."); } }; }
  }

  return { support, ticket, staff, reserve, createTicket };
}
