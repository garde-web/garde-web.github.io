// Site-wide settings (admins) and personal settings (every staff member). Markup is in staff-settings.html and staff-me.html.
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Features that an admin can switch off for everyone (staff can still open them to test)
export const FEATURES = [
  ["linkImport", "Link import", "Importing a recipe from a web address"],
  ["photoScan", "Photo scanning", "Reading a recipe from a photo"],
  ["sharing", "Recipe sharing", "Public share links and shared recipe pages"],
  ["cook", "Cook mode", "The step-by-step cooking view"],
  ["sous", "Sous planner", "The weekly meal planner (Garde Reserve)"],
  ["fridge", "What can I cook?", "Ingredient matching (Garde Reserve)"],
  ["newsroom", "Newsroom", "The public news and press pages"],
  ["tickets", "New support tickets", "Letting people open new tickets"]
];
// What each staff member may do. Admins can always do everything. Enforced by the Firestore rules.
export const PERMS = [["tickets", "Support tickets"], ["reserve", "Members and Reserve access"], ["library", "Sous library"], ["replies", "Saved replies"], ["errors", "Error reports"]];

export const DEFAULT_SITE = {
  siteName: "Garde", contactEmail: "", accent: "#e5532d", freeLimit: 50, reservePrice: "$9.99 / month", reserveRequests: true, defaultGrantMonths: 0,
  features: {}, maintenance: { on: false, message: "We're making some improvements and will be back shortly." },
  support: { eta: "We usually reply within one business day.", reserveEta: "Reserve members are answered first.", categories: ["Account", "Recipes", "Importing", "Photo upload", "Pantry", "Sous", "Garde Reserve", "Other"], maxOpen: 0, slaHours: 24 },
  news: { author: "", contact: "", boilerplate: "" }
};
const isObj = x => x && typeof x === "object" && !Array.isArray(x), num = (v, d, min = 0) => Number.isFinite(+v) && +v >= min ? Math.floor(+v) : d;
export const mergeSite = o => {
  o = isObj(o) ? o : {}; const d = DEFAULT_SITE, sub = k => ({ ...d[k], ...(isObj(o[k]) ? o[k] : {}) }), sup = sub("support");
  return { ...d, ...o, siteName: String(o.siteName || d.siteName).slice(0, 40), accent: /^#[0-9a-f]{6}$/i.test(o.accent || "") ? o.accent : d.accent, freeLimit: num(o.freeLimit, d.freeLimit, 1),
    reservePrice: String(o.reservePrice || d.reservePrice).slice(0, 30), features: isObj(o.features) ? { ...o.features } : {}, maintenance: sub("maintenance"),
    support: { ...sup, categories: Array.isArray(sup.categories) && sup.categories.length ? sup.categories : d.support.categories, maxOpen: num(sup.maxOpen, 0), slaHours: num(sup.slaHours, 24) }, news: sub("news") };
};

const csv = rows => rows.map(r => r.map(v => { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",")).join("\n");
const download = (name, text) => { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv" })), download: name }); a.click(); };
const iso = ts => ts && ts.toDate ? ts.toDate().toISOString() : "";

export function mountSettings(ctx) {
  const { db, app, $, toast, show } = ctx, me = () => ctx.user, audit = (a, t) => { try { ctx.audit && ctx.audit(a, t); } catch (e) {} };

  // ---------- Admin: Staff > Settings ----------
  async function admin(tabs) {
    if (!ctx.isAdmin) { await show("staff#denied"); return; }
    const s = ctx.site, siteRef = doc(db, "config", "site");
    const save = async (patch, what) => { try { await setDoc(siteRef, { ...patch, updatedAt: Date.now(), by: me().uid }, { merge: true }); audit("changed settings:", what); toast("Saved"); return true; } catch (e) { toast("Couldn't save. Check your Firestore rules."); return false; } };
    const ok = await show("staff-settings", { tabs, siteName: s.siteName, contactEmail: s.contactEmail, accent: s.accent,
      features: FEATURES.map(([k, label, desc]) => ({ k, label, desc, on: s.features[k] !== false })),
      maintOn: s.maintenance.on, maintMsg: s.maintenance.message, signupsOn: s.features.signups !== false,
      freeLimit: s.freeLimit, reservePrice: s.reservePrice, reserveRequests: s.reserveRequests !== false,
      grantOpts: [[0, "No end date"], [1, "1 month"], [3, "3 months"], [12, "12 months"]].map(([v, label]) => ({ v, label, on: v === +s.defaultGrantMonths })),
      eta: s.support.eta, reserveEta: s.support.reserveEta, cats: s.support.categories.join("\n"), maxOpen: s.support.maxOpen, slaHours: s.support.slaHours,
      newsAuthor: s.news.author, newsContact: s.news.contact, boiler: s.news.boilerplate });
    if (!ok) return;
    app.querySelectorAll("[data-jump]").forEach(b => b.onclick = () => { const el = document.getElementById(b.dataset.jump); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); });

    // General
    $("#acc").oninput = e => { $("#acct").value = e.target.value; };
    $("#acct").oninput = e => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) $("#acc").value = e.target.value; };
    $("#gsave").onclick = () => {
      const email = $("#gem").value.trim(), accent = $("#acct").value.trim();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("That email address doesn't look right");
      if (!/^#[0-9a-f]{6}$/i.test(accent)) return toast("Use a colour like #e5532d");
      save({ siteName: $("#gnm").value.trim().slice(0, 40) || "Garde", contactEmail: email, accent }, "general");
    };
    // Features
    $("#fsave").onclick = () => { const features = {}; app.querySelectorAll("[data-feat]").forEach(c => { features[c.dataset.feat] = c.checked; }); save({ features }, "features"); };
    // Access
    $("#asave").onclick = () => save({ maintenance: { on: $("#mon").checked, message: $("#mmsg").value.trim().slice(0, 300) }, features: { signups: $("#sgn").checked } }, "access");
    // Reserve
    $("#rsave").onclick = () => {
      const lim = parseInt($("#rlim").value);
      if (!(lim >= 1 && lim <= 100000)) return toast("The recipe limit must be a number between 1 and 100000");
      save({ freeLimit: lim, reservePrice: $("#rpr").value.trim().slice(0, 30) || "$9.99 / month", reserveRequests: $("#rreq").checked, defaultGrantMonths: +$("#rgm").value }, "Reserve");
    };
    // Support
    $("#ssave").onclick = () => {
      const cats = $("#scat").value.split("\n").map(x => x.trim()).filter(Boolean).slice(0, 15);
      if (!cats.length) return toast("Keep at least one ticket topic");
      save({ support: { eta: $("#seta").value.trim().slice(0, 200), reserveEta: $("#sres").value.trim().slice(0, 200), categories: cats, maxOpen: Math.max(0, parseInt($("#smax").value) || 0), slaHours: Math.max(1, parseInt($("#ssla").value) || 24) } }, "support");
    };
    // Newsroom
    $("#nsave").onclick = () => save({ news: { author: $("#nau").value.trim().slice(0, 80), contact: $("#nco").value.trim().slice(0, 200), boilerplate: $("#nbo").value.trim().slice(0, 1200) } }, "newsroom");
    // Reply emails + banner (their own documents)
    getDoc(doc(db, "config", "banner")).then(b => { if (b.exists()) { $("#bt").value = b.data().text || ""; $("#bo").checked = !!b.data().on; } }).catch(() => {});
    getDoc(doc(db, "config", "email")).then(b => { if (b.exists()) $("#eo").checked = !!b.data().on; }).catch(() => {});
    $("#es").onclick = () => setDoc(doc(db, "config", "email"), { on: $("#eo").checked, by: me().uid, at: Date.now() }).then(() => { audit("turned reply emails", $("#eo").checked ? "on" : "off"); toast("Saved"); }).catch(() => toast("Couldn't save. Check your Firestore rules."));
    $("#bs").onclick = () => setDoc(doc(db, "config", "banner"), { text: $("#bt").value.trim(), on: $("#bo").checked, by: me().uid, at: Date.now() }).then(() => { audit("updated", "the announcement banner"); ctx.refreshBanner(); toast("Banner published"); }).catch(() => toast("Couldn't publish. Check your Firestore rules."));
    // Exports + housekeeping
    const guard = async (name, fn) => { try { await fn(); toast(name + " downloaded"); } catch (e) { toast("Couldn't export. Check your Firestore rules."); } };
    $("#xmem").onclick = () => guard("Members", async () => {
      const [p, r] = await Promise.all([getDocs(collection(db, "profiles")), getDocs(collection(db, "reserve"))]), rs = {}; r.docs.forEach(d => { rs[d.id] = d.data(); });
      download("garde-members.csv", csv([["Name", "Email", "Account ID", "Joined", "Last seen", "Reserve", "Reserve until"], ...p.docs.map(d => { const m = d.data(), x = rs[d.id]; return [m.name, m.email, d.id, iso(m.since), iso(m.lastSeen), x ? "yes" : "no", x && x.until > 0 ? new Date(x.until).toISOString() : x ? "no end date" : ""]; })]));
    });
    $("#xtik").onclick = () => guard("Tickets", async () => {
      const t = await getDocs(collection(db, "tickets"));
      download("garde-tickets.csv", csv([["Ticket", "Subject", "Topic", "Status", "Reserve", "Name", "Email", "Opened", "Updated", "Assigned to", "Rating"], ...t.docs.map(d => { const x = d.data(); return ["GRD-" + d.id.slice(0, 6).toUpperCase(), x.subject, x.category, x.status, x.priority ? "yes" : "no", x.name, x.email, iso(x.createdAt), iso(x.updatedAt), x.assignee ? x.assignee.name : "", x.rating || ""]; })]));
    });
    $("#xaud").onclick = () => guard("Activity log", async () => {
      const a = await getDocs(query(collection(db, "audit"), orderBy("at", "desc"), limit(1000)));
      download("garde-activity.csv", csv([["When", "Who", "Action", "Target", "Detail"], ...a.docs.map(d => { const x = d.data(); return [iso(x.at), x.byName, x.action, x.target, x.detail]; })]));
    });
    $("#caud").onclick = async () => {
      if (!confirm("Delete the whole activity log? Export it first if you need a copy. This can't be undone.")) return;
      try { const a = await getDocs(collection(db, "audit")); await Promise.all(a.docs.map(d => deleteDoc(d.ref || doc(db, "audit", d.id)))); toast("Activity log cleared"); } catch (e) { toast("Couldn't clear it. Check your Firestore rules."); }
    };
  }

  // ---------- Every staff member: Staff > My settings ----------
  async function mine(tabs) {
    const p = ctx.prefs, can = "Notification" in window;
    const ok = await show("staff-me", { tabs, signature: p.signature || "", autoAssign: p.autoAssign !== false, sound: !!p.sound, desktop: !!p.desktop && can, canDesktop: can,
      filters: [["open", "Needs reply"], ["pending", "Waiting"], ["mine", "Mine"], ["unassigned", "Unassigned"], ["all", "All"]].map(([v, label]) => ({ v, label, on: v === (p.defaultFilter || "open") })),
      role: ctx.isAdmin ? "Admin" : "Staff", perms: PERMS.map(([k, label]) => ({ label, on: ctx.can(k) })) });
    if (!ok) return;
    $("#mdt") && ($("#mdt").onchange = async e => { if (e.target.checked && Notification.permission !== "granted") { const r = await Notification.requestPermission(); if (r !== "granted") { e.target.checked = false; toast("Notifications are blocked in your browser settings for this site."); } } });
    $("#mtest").onclick = () => ctx.notifyStaff({ subject: "This is a test notification", test: true });
    $("#msave").onclick = async () => {
      const next = { signature: $("#msig").value.trim().slice(0, 500), autoAssign: $("#maa").checked, sound: $("#msd").checked, desktop: $("#mdt") ? $("#mdt").checked : false, defaultFilter: $("#mfl").value };
      try { await setDoc(doc(db, "staffPrefs", me().uid), next); ctx.setPrefs(next); toast("Saved"); } catch (e) { toast("Couldn't save. Check your Firestore rules."); }
    };
  }

  return { admin, mine };
}
