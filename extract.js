// Pulls a recipe out of a web page. Self-contained on purpose: the Garde bookmarklet injects the source of
// recipeTools() and extractRecipe() into live recipe pages, so neither may use anything defined outside them.

// Cleaning rules shared by link import, pasted text, photo scans and the bookmarklet.
export function recipeTools() {
  // Leading checkbox / bullet markers: [ ] [x] [X] ( ) ▢ ☐ ☑ ✓ • - * and combinations of them
  const MARK = /^\s*(?:\[\s*[xX✓✔vV]?\s*\]|\(\s*[xX✓✔]?\s*\)|[▢☐□☑☒✓✔✗■◻◽▪•·*–—-])+\s*/;
  // Things that are page furniture, never part of a recipe
  const JUNK_ING = /^(print|pin it|pin|rate this|share|jump to|advertisement|add to|buy|shop|1x|2x|3x|us customary|metric|ingredients?|instructions?|directions?|nutrition|servings?\s*:?\s*$|scale)\b/i;
  const NOISE_STEP = /^(print|pin it|rate this|share this|jump to|advertisement|did you (?:make|try)|leave a (?:comment|review|rating|reply)|tag @|tag us|subscribe|sign up|follow us|join our|get the recipe|click here|read more|related|you (?:may|might) also like|more recipes|watch the video|nutrition|calories|serving size|disclaimer|this post may contain|affiliate|let me know|enjoy!?$)/i;
  const norm = s => String(s == null ? "" : s).replace(/\u00a0/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
  const FOOT = /\s*\[\s*(?:\d{1,2}|[a-z]|note[^\]]{0,12}|[xX✓✔])?\s*\]\s*/g;   // [1] [a] [note 2] [ ] [x] anywhere in the line

  const cleanIng = s => {
    let t = norm(s).replace(MARK, "").replace(FOOT, " ").replace(/\s*\((?:affiliate|see note|note)[^)]*\)\s*/ig, " ").replace(/[*†‡]+\s*$/, "").replace(/\s{2,}/g, " ").trim();
    if (t.length < 2 || t.length > 200 || JUNK_ING.test(t)) return "";
    if (/^(?:for (?:the )?[^,]{1,40}|optional(?: toppings| garnish)?|toppings?|garnish|special equipment|equipment)\s*:?$/i.test(t) && !/\d/.test(t)) return "";   // group labels
    if (/:\s*$/.test(t) && t.length < 45 && !/\d/.test(t)) return "";
    if (/[.!?]$/.test(t) && t.split(" ").length > 14) return "";    // a sentence, not an ingredient
    return t;
  };
  const cleanStep = s => {
    let t = norm(s).replace(MARK, "").replace(/^(?:step\s*)?\d+\s*[.):\-–]\s+/i, "").replace(/^step\s*\d+\s*[:.\-–]?\s*/i, "").replace(FOOT, " ").replace(/\s{2,}/g, " ").trim();
    if (t.length < 3 || NOISE_STEP.test(t)) return "";
    if (/:\s*$/.test(t) && t.length < 60) return "";    // "For the sauce:" is a label, not a step
    return t;
  };
  const dedupe = a => { const seen = {}; return a.filter(x => { const k = x.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; }); };
  const titleCaseLabel = t => { const w = t.split(" "); return w.length >= 2 && w.length <= 6 && !/[.!?,;]$/.test(t) && w.every(x => /^[A-Z0-9]/.test(x) || /^(a|an|the|of|and|for|to|in|with|on)$/.test(x)); };
  const cleanIngredients = arr => dedupe(arr.map(cleanIng).filter(Boolean)).slice(0, 80);
  const cleanSteps = arr => {
    let out = arr.map(cleanStep).filter(Boolean);
    const merged = [];   // a line that continues the previous sentence (starts lowercase) belongs to it
    out.forEach(t => { const p = merged[merged.length - 1]; if (p && /^[a-z,;)]/.test(t) && !/[.!?:]$/.test(p)) merged[merged.length - 1] = p + " " + t; else merged.push(t); });
    out = dedupe(merged);
    // Section titles such as "Make the sauce" or "Make The Sauce": short, unpunctuated lines among full-sentence steps
    const sentences = out.filter(t => /[.!?]$/.test(t)).length;
    out = out.filter(t => !(out.length > 3 && titleCaseLabel(t)) && !(sentences >= 2 && !/[.!?:]$/.test(t) && t.split(" ").length <= 4 && t.length < 35));
    out = out.filter((t, i) => !(t.length >= 12 && out.some((o, j) => j !== i && o.length > t.length + 10 && o.toLowerCase().includes(t.toLowerCase()))));
    return out.slice(0, 40);
  };
  return { cleanIng, cleanStep, cleanIngredients, cleanSteps };
}

export function extractRecipe(dom, url) {
  const T = recipeTools();
  const txt = h => new DOMParser().parseFromString("<body>" + String(h == null ? "" : h), "text/html").body.textContent.replace(/\s+/g, " ").trim();
  const abs = u => { try { return u ? new URL(u, url).href.replace(/^http:/, "https:") : ""; } catch (e) { return ""; } };
  const meta = k => (dom.querySelector('meta[property="' + k + '"],meta[name="' + k + '"]') || {}).content || "";
  const mins = iso => { const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(iso || ""); return m ? (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };
  const hm = n => n ? (n >= 60 ? Math.floor(n / 60) + " h" + (n % 60 ? " " + (n % 60) + " min" : "") : n + " min") : "";
  const pageTitle = t => txt(t).replace(/\s+recipe\s*$/i, "").split(/\s[|–—-]\s/)[0].trim();
  const lines = x => [].concat(x || []).reduce((a, v) => a.concat(typeof v === "string" ? v.split(/<br\s*\/?>|\n/i) : [v]), []);
  const flat = n => !n ? [] : typeof n === "string" ? n.split(/<br\s*\/?>|\n/i) : Array.isArray(n) ? n.reduce((a, v) => a.concat(flat(v)), []) : n.itemListElement ? flat(n.itemListElement) : n.text ? flat(n.text) : n.name ? flat(n.name) : [];
  const uniq = a => a.filter((v, i) => a.indexOf(v) === i);
  const sim = (a, b) => { const x = String(a).toLowerCase().match(/[a-z0-9]+/g) || [], y = String(b).toLowerCase().match(/[a-z0-9]+/g) || []; return x.filter(w => y.indexOf(w) > -1).length / Math.max(1, Math.min(x.length, y.length)); };
  const BAD = '[class*="comment"],[id*="comment"],[class*="related"],[class*="sidebar"],[class*="widget"],[class*="share"],[class*="social"],[class*="newsletter"],[class*="breadcrumb"],[class*="nutrition"],[class*="review"],[class*="popular"],nav,footer,header,aside';
  const bad = el => !!(el.closest && el.closest(BAD));

  // 1. Structured data (what most recipe sites publish): only the real recipe fields, never the story or the comments
  const found = [];
  const walk = n => { if (!n || typeof n !== "object") return; if (Array.isArray(n)) return n.forEach(walk); if ([].concat(n["@type"] || []).some(t => /(^|\/)Recipe$/i.test(String(t)))) found.push(n); Object.keys(n).forEach(k => walk(n[k])); };
  dom.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    const raw = s.textContent.replace(/[\u0000-\u001f]+/g, " ");
    try { walk(JSON.parse(raw)); } catch (e) { try { walk(JSON.parse(raw.replace(/,\s*([}\]])/g, "$1"))); } catch (e2) {} }
  });
  const pName = pageTitle(meta("og:title") || (dom.querySelector("h1") || {}).textContent || dom.title);
  let best = null;
  found.forEach(r => {
    const ing = T.cleanIngredients(lines(r.recipeIngredient || r.ingredients).map(txt)), steps = T.cleanSteps(flat(r.recipeInstructions).map(txt));
    const score = ing.length + steps.length + (sim(r.name || "", pName) >= 0.6 ? 100 : 0);   // prefer the recipe this page is actually about
    if (!best || score > best.score) best = { r: r, ing: ing, steps: steps, score: score };
  });

  // 2. Recipe-card plugins and microdata, searched inside the recipe card only (so comments, related posts and menus are ignored)
  const ING = ['[itemprop="recipeIngredient"]', '[itemprop="ingredients"]', ".wprm-recipe-ingredient", ".tasty-recipes-ingredients li", ".mv-create-ingredients li", ".recipe-ingredients li", ".ingredients-item", '[class*="ingredient"] li'];
  const STEP = ['[itemprop="recipeInstructions"] li', '[itemprop="recipeInstructions"] p', ".wprm-recipe-instruction-text", ".tasty-recipes-instructions li", ".mv-create-instructions li", ".recipe-instructions li", ".instructions-section-item p", '[class*="instruction"] li', '[class*="direction"] li'];
  const pick = (root, sels) => { for (let i = 0; i < sels.length; i++) { const x = [].slice.call(root.querySelectorAll(sels[i])).filter(e => !bad(e)).map(e => txt(e.innerHTML)).filter(l => l && l.length < 500); if (x.length > 1) return x; } return []; };
  const SCOPES = [".wprm-recipe-container", ".tasty-recipes", ".mv-create-wrapper", ".recipe-card", '[itemtype*="schema.org/Recipe"]', '[class*="recipe-card"]', '[class*="recipe-container"]', "article"];
  let root = dom; for (let i = 0; i < SCOPES.length; i++) { const el = dom.querySelector(SCOPES[i]); if (el && pick(el, ING).length > 1) { root = el; break; } }

  // 3. Last resort: find the "Ingredients" / "Instructions" headings and take only the list that sits right under each one
  const HEAD = "h1,h2,h3,h4,h5,h6", byHeading = (re, min) => {
    const hs = [].slice.call(root.querySelectorAll(HEAD + ",strong,b")).filter(x => x.textContent.trim().length < 40 && re.test(x.textContent.trim().replace(/[:\s]+$/, "")) && !bad(x));
    for (let k = 0; k < hs.length; k++) {
      const h = hs[k], stop = [].slice.call(root.querySelectorAll(HEAD)).filter(x => x !== h && (h.compareDocumentPosition(x) & 4) && !h.contains(x))[0];
      const inRange = el => (h.compareDocumentPosition(el) & 4) && !el.contains(h) && !bad(el) && (!stop || (stop.compareDocumentPosition(el) & 2));   // after the heading, before the next one
      const l = [].slice.call(root.querySelectorAll("ul,ol")).filter(x => inRange(x) && x.querySelectorAll(":scope > li").length > 1)[0];
      if (l) return [].slice.call(l.querySelectorAll(":scope > li")).map(e => txt(e.innerHTML)).filter(Boolean);
      const out = []; let n = (h.closest(HEAD + ",p,div") || h).nextElementSibling;
      while (n && !/^H[1-6]$/.test(n.tagName) && !bad(n) && out.length < 40) { if (/^(P|DIV)$/.test(n.tagName)) n.innerHTML.split(/<br\s*\/?>/i).map(txt).forEach(t => { if (t.length >= min) out.push(t); }); n = n.nextElementSibling; }
      if (out.length) return out;
    }
    return [];
  };

  const ogImg = abs(meta("og:image") || meta("twitter:image"));
  if (best && best.ing.length > 1) {
    const r = best.r, im = [].concat(r.image || [])[0], y = [].concat(r.recipeYield || []).map(String).join(" ").match(/\d+/);
    const total = mins(r.totalTime) || mins(r.prepTime) + mins(r.cookTime);
    const tags = uniq([].concat(r.recipeCategory || [], r.recipeCuisine || [], String(r.keywords || "").split(",")).map(txt).filter(t => t && t.length < 24)).slice(0, 5);
    let steps = best.steps, how = "structured";
    if (!steps.length) { steps = T.cleanSteps(pick(root, STEP).concat(steps.length ? [] : [])); if (!steps.length) steps = T.cleanSteps(byHeading(/^(?:instructions?|directions?|method|steps?|preparation|how to make)\b/i, 15)); how = steps.length ? "plugin" : "structured"; }
    return { title: pageTitle(r.name || pName), source: url, image: abs(typeof im === "string" ? im : im && (im.url || im.contentUrl)) || ogImg, time: hm(total), servings: y ? y[0] : "", ingredients: best.ing, steps: steps, tags: tags, how: how };
  }
  let ing = T.cleanIngredients(pick(root, ING)), steps = T.cleanSteps(pick(root, STEP)), how = "plugin";
  if (ing.length < 2 || !steps.length) {
    how = "layout";
    if (ing.length < 2) ing = T.cleanIngredients(byHeading(/^(?:the )?ingredients?\b/i, 3));
    if (!steps.length) steps = T.cleanSteps(byHeading(/^(?:instructions?|directions?|method|steps?|preparation|how to make)\b/i, 15));
  }
  if (ing.length < 2) return null;
  return { title: pName, source: url, image: ogImg, time: "", servings: "", ingredients: ing, steps: steps, tags: [], how: how };
}

// One-click "Save to Garde" bookmarklet: runs in the visitor's own browser, so paywalls, bot-blocking and
// JavaScript-rendered pages don't matter. It opens Garde with the recipe already filled in.
export const bookmarklet = gardeUrl => "javascript:" + encodeURIComponent(
  "(function(){try{var recipeTools=" + recipeTools.toString() + ";var f=" + extractRecipe.toString() + ";var r=f(document,location.href);if(!r){alert(\"Garde couldn't find a recipe on this page.\");return}" +
  "var s=btoa(unescape(encodeURIComponent(JSON.stringify(r)))).replace(/\\+/g,\"-\").replace(/\\//g,\"_\").replace(/=+$/,\"\");" +
  "window.open(" + JSON.stringify(gardeUrl) + "+\"#/import/\"+s,\"_blank\")}catch(e){alert(\"Garde error: \"+e.message)}})()");
