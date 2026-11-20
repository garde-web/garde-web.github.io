// Garde helper for Cloudflare Workers (free plan is enough). It does two jobs:
//   1. Link import: GET  ?url=https://recipe-site/...   returns that page's HTML so Garde can read the recipe.
//   2. Smart photo scan (Garde Reserve): POST  {image: base64 jpeg}  returns the recipe found in the photo, read by Google Gemini.
// Setup: Cloudflare dashboard -> Workers & Pages -> Create -> "Hello World" -> Deploy, then Edit code and paste this file.
// Settings -> Variables and Secrets:
//   ALLOWED_ORIGINS    = https://YOURNAME.github.io          (comma-separate extras, e.g. ,http://localhost:5500)
//   FIREBASE_PROJECT_ID = your Firebase project ID            (smart scan only)
//   GEMINI_API_KEY      = a key from https://aistudio.google.com/apikey   (smart scan only; add it as a Secret)
//   GEMINI_MODEL        = optional, defaults to gemini-2.5-flash
// Then copy the worker URL (https://something.workers.dev) into IMPORT_PROXY in firebase-config.js.
const PROMPT = "Read the recipe in this photo (it may be handwritten, a cookbook page or a screenshot). Transcribe it faithfully and do not invent anything. " +
  "Reply with JSON only: {\"title\": string, \"servings\": string with just the number, \"time\": string like \"45 min\" or \"\", \"ingredients\": [one string per ingredient, keeping the quantity], \"steps\": [one string per step], \"tags\": [up to 4 short tags]}. " +
  "Ignore any text that is not part of the recipe. If you cannot find a recipe, reply {\"title\":\"\",\"ingredients\":[],\"steps\":[]}.";

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const ok = allowed.includes(origin);
    const cors = { "Access-Control-Allow-Origin": ok ? origin : "null", "Vary": "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400" } });
    if (!ok) return new Response("Forbidden", { status: 403, headers: cors });
    if (req.method === "POST") return scan(req, env, cors);

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

// Checks a Firebase sign-in token (signature, project, expiry) and returns the user's ID.
export async function verifyToken(token, pid) {
  const [h, p, s] = String(token).split("."); if (!s) throw new Error("bad token");
  const b64 = x => Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const head = JSON.parse(new TextDecoder().decode(b64(h))), pay = JSON.parse(new TextDecoder().decode(b64(p))), now = Date.now() / 1000;
  if (head.alg !== "RS256" || pay.aud !== pid || pay.iss !== "https://securetoken.google.com/" + pid || !(pay.exp > now) || pay.iat > now + 300 || !pay.sub) throw new Error("bad claims");
  const jwks = await (await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com", { cf: { cacheTtl: 3600, cacheEverything: true } })).json();
  const jwk = (jwks.keys || []).find(k => k.kid === head.kid); if (!jwk) throw new Error("unknown key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64(s), new TextEncoder().encode(h + "." + p)))) throw new Error("bad signature");
  return pay.sub;
}

const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
const list = (v, n, m) => (Array.isArray(v) ? v : []).map(x => clip(x, n)).filter(Boolean).slice(0, m);
export async function scan(req, env, cors) {
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  if (!env.GEMINI_API_KEY || !env.FIREBASE_PROJECT_ID) return json({ error: "Smart scan isn't set up yet" }, 501);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  let uid; try { uid = await verifyToken(token, env.FIREBASE_PROJECT_ID); } catch (e) { return json({ error: "Please sign in again" }, 401); }
  // Reserve check: read the caller's own reserve document with their own token (Firestore rules decide what they may see)
  const rr = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/reserve/${uid}`, { headers: { Authorization: "Bearer " + token } });
  if (!rr.ok) return json({ error: "Smart scan is part of Garde Reserve" }, 403);
  const until = Number(((await rr.json()).fields || {}).until?.integerValue || 0);
  if (until > 0 && until < Date.now()) return json({ error: "Your Reserve access has ended" }, 403);
  let body; try { body = await req.json(); } catch (e) { return json({ error: "Bad request" }, 400); }
  const img = String(body.image || "");
  if (!/^[A-Za-z0-9+/=]+$/.test(img)) return json({ error: "Bad image" }, 400);
  if (img.length > 4_000_000) return json({ error: "That photo is too large" }, 413);
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: img } }] }], generationConfig: { responseMimeType: "application/json", temperature: 0 } })
  });
  if (!g.ok) return json({ error: "The scan service is unavailable right now" }, 502);
  const out = await g.json(), text = ((out.candidates || [])[0]?.content?.parts || []).map(p => p.text || "").join("");
  try {
    const r = JSON.parse(text.replace(/^\s*```(?:json)?|```\s*$/g, ""));
    const res = { title: clip(r.title, 200), servings: clip(r.servings, 6).replace(/\D.*/, ""), time: clip(r.time, 40), ingredients: list(r.ingredients, 300, 80), steps: list(r.steps, 1000, 60), tags: list(r.tags, 24, 4) };
    if (!res.title && !res.ingredients.length) return json({ error: "Couldn't find a recipe in that photo" }, 422);
    return json(res);
  } catch (e) { return json({ error: "Couldn't read a recipe from that photo" }, 422); }
}
