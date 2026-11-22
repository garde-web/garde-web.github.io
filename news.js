// The public Newsroom and the admin writing tools. Markup is in news.html, article.html and staff-newsroom.html.
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { resizeImage, thumbOf } from "./photos.js";

const TYPES = { press: "Press release", article: "Article", announcement: "Announcement" };
const day = ms => ms ? new Date(ms).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" }) : "Not published";
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Safe, tiny formatter for article text: everything is escaped first, then a few simple styles are added.
//   # Heading   ## Subheading   - bullet   1. numbered   > quote   --- divider   **bold**   *italic*   [link](https://…)   ![alt](https://image)
const inline = s => {
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|#\/)[^\s)]+)\)/g, (m, t, u) => `<a href="${u}"${/^https?/.test(u) ? ' target="_blank" rel="noopener noreferrer"' : ""}>${t}</a>`);
  return s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
};
export function md(src) {
  const L = String(src || "").replace(/\r/g, "").split("\n"), out = []; let i = 0;
  const blank = l => !l.trim(), BLOCK = /^(#{1,3}\s|---+\s*$|[-*]\s+|\d+[.)]\s+|>)/;
  const group = (re, wrap, item) => { const items = []; while (i < L.length && re.test(L[i])) { items.push(item(L[i])); i++; } out.push(wrap(items)); };
  while (i < L.length) {
    const l = L[i]; let m;
    if (blank(l)) { i++; continue; }
    if ((m = /^(#{1,3})\s+(.+)$/.exec(l))) { const n = m[1].length + 1; out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
    if (/^---+\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (/^[-*]\s+/.test(l)) { group(/^[-*]\s+/, a => "<ul>" + a.join("") + "</ul>", x => `<li>${inline(x.replace(/^[-*]\s+/, ""))}</li>`); continue; }
    if (/^\d+[.)]\s+/.test(l)) { group(/^\d+[.)]\s+/, a => "<ol>" + a.join("") + "</ol>", x => `<li>${inline(x.replace(/^\d+[.)]\s+/, ""))}</li>`); continue; }
    if (/^>/.test(l)) { group(/^>/, a => "<blockquote>" + a.join("<br>") + "</blockquote>", x => inline(x.replace(/^>\s?/, ""))); continue; }
    const para = [inline(l)]; i++;
    while (i < L.length && !blank(L[i]) && !BLOCK.test(L[i])) { para.push(inline(L[i])); i++; }
    out.push(`<p>${para.join("<br>")}</p>`);
  }
  return out.join("\n");
}

export function mountNews(ctx) {
  const { db, app, $, toast, show, fill } = ctx;
  const card = n => ({ slug: n.id, title: n.title, summary: n.summary || "", type: n.type, typeLabel: TYPES[n.type] || "Article", date: day(n.published), thumb: n.thumb || n.coverUrl || "", letter: (n.title || "?")[0] });

  // ---------- Public ----------
  async function news(slug) { return slug ? article(slug) : list(); }

  async function list() {
    if (!(await show("news"))) return;
    let all = [], type = "all";
    try { all = (await getDocs(query(collection(db, "news"), where("status", "==", "published")))).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.published || 0) - (a.published || 0)); } catch (e) {}
    const draw = () => {
      const f = all.filter(n => type === "all" || n.type === type), feat = f.find(n => n.featured);
      fill($("#nlist"), "news#cards", { none: !f.length, featured: feat ? card(feat) : null, cards: f.filter(n => n !== feat).map(card) });
    };
    app.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { type = b.dataset.f; app.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); });
    draw();
  }

  async function article(slug) {
    let s = null; try { s = await getDoc(doc(db, "news", slug)); } catch (e) {}
    if (!s || !s.exists()) { await show("article#missing"); return; }
    const n = { id: slug, ...s.data() };
    let cover = n.coverUrl || n.thumb || "";
    if (n.hasMedia) { try { const m = await getDoc(doc(db, "newsMedia", slug)); if (m.exists() && m.data().full) cover = m.data().full; } catch (e) {} }
    let more = []; try { more = (await getDocs(query(collection(db, "news"), where("status", "==", "published")))).docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.id !== slug).sort((a, b) => (b.published || 0) - (a.published || 0)).slice(0, 3).map(card); } catch (e) {}
    const ok = await show("article", { title: n.title, type: n.type, typeLabel: TYPES[n.type] || "Article", press: n.type === "press", date: day(n.published), author: n.author || "", summary: n.summary || "", contact: n.contact || "", draft: n.status !== "published", cover, body: md(n.body), more });
    if (!ok) return;
    const old = document.title; document.title = `${n.title} – Garde Newsroom`;
    ctx.setUnsub(() => { document.title = old; });
    $("#ncopy").onclick = async () => { try { await navigator.clipboard.writeText(location.href); toast("Link copied"); } catch (e) { toast("Copy the address from your browser's address bar"); } };
    $("#npr").onclick = () => window.print();
  }

  // ---------- Admin: Staff > Newsroom ----------
  async function admin(tabs) {
    if (!ctx.isAdmin) { await show("staff#denied"); return; }
    let items = [], ed = null, cover = { thumb: "", full: "", url: "" }, slugTouched = false;
    const load = async () => { try { items = (await getDocs(collection(db, "news"))).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updated || 0) - (a.updated || 0)); } catch (e) { toast("Couldn't load the newsroom. Publish the updated Firestore rules."); } };
    const opts = (obj, cur) => Object.keys(obj).map(v => ({ v, label: obj[v], on: v === cur }));
    const draw = async () => {
      if (!ed) {
        const ok = await show("staff-newsroom#list", { tabs, items: items.map(n => ({ id: n.id, title: n.title, typeLabel: TYPES[n.type] || "Article", status: n.status, statusLabel: n.status === "published" ? "Published" : "Draft", date: day(n.published || n.updated), featured: !!n.featured })) });
        if (!ok) return;
        $("#nnew").onclick = () => { ed = { isNew: true, type: "article", title: "", slug: "", summary: "", body: "", author: ctx.user.displayName || "", contact: "", featured: false, status: "draft", published: 0 }; cover = { thumb: "", full: "", url: "" }; slugTouched = false; draw(); };
        app.querySelectorAll("[data-e]").forEach(b => b.onclick = async () => {
          const n = items.find(x => x.id === b.dataset.e); ed = { ...n, slug: n.id }; slugTouched = true; cover = { thumb: n.thumb || "", full: "", url: n.coverUrl || "" };
          if (n.hasMedia) { try { const m = await getDoc(doc(db, "newsMedia", n.id)); if (m.exists()) cover.full = m.data().full || ""; } catch (e) {} }
          draw();
        });
        app.querySelectorAll("[data-d]").forEach(b => b.onclick = async () => {
          const n = items.find(x => x.id === b.dataset.d); if (!n || !confirm(`Delete "${n.title}"? This can't be undone.`)) return;
          try { await deleteDoc(doc(db, "news", n.id)); await deleteDoc(doc(db, "newsMedia", n.id)).catch(() => {}); ctx.audit && ctx.audit("deleted article", n.title); await load(); draw(); toast("Deleted"); } catch (e) { toast("Couldn't delete. Check your Firestore rules."); }
        });
        return;
      }
      const ok = await show("staff-newsroom#editor", { tabs, editing: !ed.isNew, types: opts(TYPES, ed.type), title: ed.title, slug: ed.slug, summary: ed.summary, body: ed.body, author: ed.author, contact: ed.contact, featured: !!ed.featured, coverUrl: cover.url, preview: cover.full || cover.thumb || cover.url, wasPublished: ed.status === "published" });
      if (!ok) return;
      const grab = () => ({ ...ed, type: $("#nt").value, title: $("#nti").value.trim(), slug: $("#ns").value.trim(), summary: $("#nsu").value.trim(), body: $("#nb").value, author: $("#na").value.trim(), contact: $("#nc").value.trim(), featured: $("#nf").checked });
      cover.url = $("#ncu").value.trim();
      const prev = () => { $("#prev").innerHTML = md($("#nb").value) || '<p class="meta">Nothing to preview yet.</p>'; };
      $("#nti").oninput = e => { if (!slugTouched && ed.isNew) $("#ns").value = slugify(e.target.value); };
      $("#ns").oninput = () => { slugTouched = true; };
      $("#nb").oninput = prev; prev();
      const wrap = (before, after = before, ph = "text") => { const ta = $("#nb"), a = ta.selectionStart, b = ta.selectionEnd, sel = ta.value.slice(a, b) || ph; ta.value = ta.value.slice(0, a) + before + sel + after + ta.value.slice(b); ta.focus(); ta.setSelectionRange(a + before.length, a + before.length + sel.length); prev(); };
      const lineStart = pre => { const ta = $("#nb"), a = ta.selectionStart, s = ta.value.lastIndexOf("\n", a - 1) + 1; ta.value = ta.value.slice(0, s) + pre + ta.value.slice(s); ta.focus(); prev(); };
      $("#fb").onclick = () => wrap("**"); $("#fi").onclick = () => wrap("*"); $("#fh").onclick = () => lineStart("## "); $("#fl").onclick = () => lineStart("- "); $("#fq").onclick = () => lineStart("> "); $("#fk").onclick = () => wrap("[", "](https://)", "link text");
      $("#ncf").onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const g = grab(); cover.full = await resizeImage(f, 1200, 0.72); cover.thumb = await thumbOf(f, 560, 340); cover.url = ""; ed = g; draw(); } catch (err) { toast("Couldn't read that image."); } };
      if ($("#ncx")) $("#ncx").onclick = () => { const g = grab(); cover = { thumb: "", full: "", url: "" }; ed = g; draw(); };
      $("#ncancel").onclick = () => { ed = null; draw(); };
      const persist = async status => {
        const g = grab();
        if (!g.title) return toast("Add a title");
        if (g.body.trim().length < 20) return toast("Write the article text first");
        if (!/^[a-z0-9-]{3,80}$/.test(g.slug)) return toast("The web address needs 3+ letters, numbers or dashes");
        if (g.isNew) { let taken = items.some(x => x.id === g.slug); if (!taken) { try { taken = (await getDoc(doc(db, "news", g.slug))).exists(); } catch (e) {} } if (taken) return toast("That web address is already used. Change it."); }
        const now = Date.now(), pub = status === "published" ? (g.published || now) : (g.published || 0);
        const data = { type: g.type, title: g.title, summary: g.summary || g.body.replace(/[#*>\[\]()!_-]/g, "").slice(0, 170).trim(), body: g.body, author: g.author, contact: g.contact, featured: g.featured && status === "published", status, thumb: cover.thumb || "", coverUrl: cover.url || "", hasMedia: !!cover.full, published: pub, updated: now };
        try {
          await setDoc(doc(db, "news", g.slug), data);
          if (cover.full) await setDoc(doc(db, "newsMedia", g.slug), { full: cover.full }); else await deleteDoc(doc(db, "newsMedia", g.slug)).catch(() => {});
          ctx.audit && ctx.audit(status === "published" ? "published article" : "saved draft", g.title);
          toast(status === "published" ? "Published" : "Draft saved"); ed = null; await load(); draw();
        } catch (e) { toast("Couldn't save. Check your Firestore rules, and that the cover image isn't huge."); }
      };
      $("#nsave").onclick = () => persist("draft"); $("#npub").onclick = () => persist("published");
    };
    await load(); await draw();
  }

  return { news, admin };
}
