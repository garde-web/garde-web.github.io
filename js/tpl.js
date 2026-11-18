// A tiny template system so page markup lives in pages/*.html instead of JavaScript.
//   {{name}}  escaped value      {{{name}}}  raw HTML      {{a.b}}  nested value
//   {{#if x}} … {{else}} … {{/if}}      {{#unless x}} … {{/unless}}
//   {{#each list}} … {{else}} (empty) … {{/each}}      inside a loop: {{.}} is the item, {{@index}} its position
//   {{> file#section}}  include another section.   A page file can hold extra <template id="section"> blocks.
const files = {}, gen = new WeakMap();
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TOKEN = /\{\{\{\s*([^}]+?)\s*\}\}\}|\{\{\s*(#if|#unless|#each|\/if|\/unless|\/each|else(?=\s*\}\})|>)?\s*([^}]*?)\s*\}\}/g;

function parse(src) {
  const root = { body: [], alt: [], at: "body" }, stack = [root]; let last = 0, m; TOKEN.lastIndex = 0;
  const put = n => { const t = stack[stack.length - 1]; t[t.at].push(n); };
  while ((m = TOKEN.exec(src))) {
    if (m.index > last) put({ t: "text", v: src.slice(last, m.index) });
    last = TOKEN.lastIndex;
    const k = m[2], a = m[1] || m[3];
    if (m[1]) put({ t: "var", p: a, raw: true });
    else if (!k) put({ t: "var", p: a });
    else if (k === "else") stack[stack.length - 1].at = "alt";
    else if (k === ">") put({ t: "inc", name: a });
    else if (k[0] === "#") { const n = { t: k.slice(1), p: a, body: [], alt: [], at: "body" }; put(n); stack.push(n); }
    else stack.pop();
  }
  if (last < src.length) put({ t: "text", v: src.slice(last) });
  return root.body;
}

async function loadFile(name) {
  if (files[name]) return files[name];
  const r = await fetch(`pages/${name}.html`, { cache: "no-cache" });
  if (!r.ok) throw new Error(`pages/${name}.html could not be loaded (${r.status}). Check that the pages folder was uploaded.`);
  const src = await r.text(), frags = {};
  const main = src.replace(/<template id="([\w-]+)">([\s\S]*?)<\/template>/g, (_, id, body) => { frags[id] = parse(body); return ""; });
  if (main.trim() && !frags.main) frags.main = parse(main);
  return files[name] = { src, frags };
}
const frag = spec => { const [f, id = "main"] = spec.split("#"); return files[f].frags[id]; };
async function ensure(nodes) {
  if (nodes.ok) return; nodes.ok = true;
  for (const n of nodes) {
    if (n.t === "inc") { await get(n.name); }
    else if (n.body) { await ensure(n.body); await ensure(n.alt); }
  }
}
async function get(spec) {
  const [f, id = "main"] = spec.split("#"), file = await loadFile(f);
  if (!file.frags[id]) throw new Error(`pages/${f}.html has no "${id}" section.`);
  await ensure(file.frags[id]); return file.frags[id];
}

const truthy = v => Array.isArray(v) ? v.length > 0 : !!v;
function look(st, p) {
  const top = st[st.length - 1];
  if (p === ".") return top.v;
  if (p === "@index") return top.i;
  const parts = p.split(".");
  for (let s = st.length - 1; s >= 0; s--) {
    const v = st[s].v;
    if (v != null && typeof v === "object" && parts[0] in v) { let x = v[parts[0]]; for (let j = 1; j < parts.length && x != null; j++) x = x[parts[j]]; return x; }
  }
}
function out(nodes, st) {
  let s = "";
  for (const n of nodes) {
    if (n.t === "text") s += n.v;
    else if (n.t === "var") { const v = look(st, n.p); s += v == null ? "" : n.raw ? v : esc(v); }
    else if (n.t === "if" || n.t === "unless") s += out(truthy(look(st, n.p)) === (n.t === "if") ? n.body : n.alt, st);
    else if (n.t === "each") { const a = look(st, n.p); if (Array.isArray(a) && a.length) a.forEach((v, i) => { s += out(n.body, [...st, { v, i }]); }); else s += out(n.alt, st); }
    else if (n.t === "inc") s += out(frag(n.name), st);
  }
  return s;
}

export async function view(spec, data = {}) { return out(await get(spec), [{ v: data }]); }
// Render into an element. If a newer render started meanwhile, this one is dropped and false is returned.
export async function fill(el, spec, data) {
  const g = (gen.get(el) || 0) + 1; gen.set(el, g); let html;
  try { html = await view(spec, data); } catch (e) { console.error(e); html = `<div class="empty glass"><h3>This page couldn't load</h3>${esc(e.message)}</div>`; }
  if (gen.get(el) !== g) return false;
  el.innerHTML = html; return true;
}
// The FAQ lives in pages/faq.html; this reads it back as [question, answer] pairs for ticket suggestions.
export async function faqItems() {
  const f = await loadFile("faq"), plain = h => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
  return [...f.src.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)].map(m => [plain(m[1]), plain(m[2])]);
}
