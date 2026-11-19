// Garde link-import proxy for Cloudflare Workers (free plan is enough).
// 1. Cloudflare dashboard → Workers & Pages → Create → "Hello World" → Deploy, then Edit code and paste this file.
// 2. Settings → Variables: add ALLOWED_ORIGINS = https://YOURNAME.github.io   (comma-separate extras, e.g. ,http://localhost:5500)
// 3. Copy the worker URL (https://something.workers.dev) into IMPORT_PROXY in firebase-config.js.
export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const ok = allowed.includes(origin);
    const cors = { "Access-Control-Allow-Origin": ok ? origin : "null", "Vary": "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" } });
    if (!ok) return new Response("Forbidden", { status: 403, headers: cors });

    let u;
    try { u = new URL(new URL(req.url).searchParams.get("url")); } catch { return new Response("Bad url", { status: 400, headers: cors }); }
    if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/i.test(u.hostname)) return new Response("Blocked", { status: 403, headers: cors });

    const r = await fetch(u.href, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    const type = r.headers.get("content-type") || "";
    if (!/text\/html|xhtml/i.test(type)) return new Response("Not a web page", { status: 415, headers: cors });
    const body = await r.arrayBuffer();
    if (body.byteLength > 3_000_000) return new Response("Too large", { status: 413, headers: cors });
    return new Response(body, { status: r.status, headers: { ...cors, "Content-Type": type } });
  }
};
