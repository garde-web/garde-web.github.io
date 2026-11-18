// Pulls a recipe out of a web page. Self-contained on purpose: the Garde bookmarklet injects this
// function's source into live recipe pages, so it must not use anything defined outside it.
export function extractRecipe(dom, url) {
  const txt = h => new DOMParser().parseFromString("<body>" + String(h == null ? "" : h), "text/html").body.textContent.replace(/\s+/g, " ").trim();
  const abs = u => { try { return u ? new URL(u, url).href.replace(/^http:/, "https:") : ""; } catch (e) { return ""; } };
  const meta = k => (dom.querySelector('meta[property="' + k + '"],meta[name="' + k + '"]') || {}).content || "";
  const mins = iso => { const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(iso || ""); return m ? (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };
  const hm = n => n ? (n >= 60 ? Math.floor(n / 60) + " h" + (n % 60 ? " " + (n % 60) + " min" : "") : n + " min") : "";
  const bul = l => l.replace(/^[▢☐□▪•·*–—-]+\s*/, "").trim();
  const num = l => l.replace(/^(?:step\s*)?\d+[.):]\s+(?=\D)/i, "").trim();
  const pageTitle = t => txt(t).replace(/\s+recipe\s*$/i, "").split(/\s[|–—-]\s/)[0].trim();
  const lines = x => [].concat(x || []).reduce((a, v) => a.concat(typeof v === "string" ? v.split(/<br\s*\/?>|\n/i) : [v]), []);
  const flat = n => !n ? [] : typeof n === "string" ? n.split(/<br\s*\/?>|\n/i) : Array.isArray(n) ? n.reduce((a, v) => a.concat(flat(v)), []) : n.itemListElement ? flat(n.itemListElement) : n.text ? flat(n.text) : n.name ? flat(n.name) : [];
  const uniq = a => a.filter((v, i) => a.indexOf(v) === i);

  // 1. Structured data (what most recipe sites publish): only the real recipe fields, never the story
  const found = [];
  const walk = n => { if (!n || typeof n !== "object") return; if (Array.isArray(n)) return n.forEach(walk); if ([].concat(n["@type"] || []).some(t => /(^|\/)Recipe$/i.test(String(t)))) found.push(n); Object.keys(n).forEach(k => walk(n[k])); };
  dom.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    const raw = s.textContent.replace(/[\u0000-\u001f]+/g, " ");
    try { walk(JSON.parse(raw)); } catch (e) { try { walk(JSON.parse(raw.replace(/,\s*([}\]])/g, "$1"))); } catch (e2) {} }
  });
  let best = null;
  found.forEach(r => { const c = { r: r, ing: uniq(lines(r.recipeIngredient || r.ingredients).map(txt).map(bul).filter(Boolean)), steps: uniq(flat(r.recipeInstructions).map(txt).map(num).filter(Boolean)) }; if (!best || c.ing.length + c.steps.length > best.ing.length + best.steps.length) best = c; });
  const ogImg = abs(meta("og:image") || meta("twitter:image"));
  if (best && best.ing.length > 1) {
    const r = best.r, im = [].concat(r.image || [])[0], y = [].concat(r.recipeYield || []).map(String).join(" ").match(/\d+/);
    const total = mins(r.totalTime) || mins(r.prepTime) + mins(r.cookTime);
    const tags = uniq([].concat(r.recipeCategory || [], r.recipeCuisine || [], String(r.keywords || "").split(",")).map(txt).filter(t => t && t.length < 24)).slice(0, 5);
    return { title: pageTitle(r.name || meta("og:title") || dom.title), source: url, image: abs(typeof im === "string" ? im : im && (im.url || im.contentUrl)) || ogImg, time: hm(total), servings: y ? y[0] : "", ingredients: best.ing, steps: best.steps, tags: tags };
  }

  // 2. Recipe-card plugins and microdata
  const all = sels => { for (let i = 0; i < sels.length; i++) { const x = [].slice.call(dom.querySelectorAll(sels[i])).map(e => txt(e.innerHTML)).filter(l => l && l.length < 400); if (x.length > 1) return x; } return []; };
  let ing = all(['[itemprop="recipeIngredient"]', '[itemprop="ingredients"]', ".wprm-recipe-ingredient", ".tasty-recipes-ingredients li", ".mv-create-ingredients li", ".recipe-ingredients li", ".ingredients-item", '[class*="ingredient"] li']).map(bul).filter(l => l.length < 160);
  let steps = all(['[itemprop="recipeInstructions"] li', '[itemprop="recipeInstructions"] p', ".wprm-recipe-instruction-text", ".tasty-recipes-instructions li", ".mv-create-instructions li", ".recipe-instructions li", ".instructions-section-item p", '[class*="instruction"] li', '[class*="direction"] li']).map(num);

  // 3. Last resort: find the Ingredients / Instructions headings and take only what follows them
  if (ing.length < 2 || !steps.length) {
    const heads = [].slice.call(dom.querySelectorAll("h1,h2,h3,h4,h5,h6,strong,b,p.title,div.title")), lists = [].slice.call(dom.querySelectorAll("ul,ol"));
    const grab = (re, min) => {
      const h = heads.filter(x => x.textContent.trim().length < 40 && re.test(x.textContent.trim().replace(/[:\s]+$/, "")))[0]; if (!h) return [];
      const l = lists.filter(x => (h.compareDocumentPosition(x) & 4) && !x.contains(h) && x.querySelectorAll(":scope > li").length > 1)[0];
      if (l) return [].slice.call(l.querySelectorAll(":scope > li")).map(e => txt(e.innerHTML)).filter(Boolean);
      const out = []; let n = (h.closest("h1,h2,h3,h4,h5,h6,p,div") || h).nextElementSibling;
      while (n && !/^H[1-6]$/.test(n.tagName) && out.length < 40) { if (/^(P|DIV)$/.test(n.tagName)) n.innerHTML.split(/<br\s*\/?>/i).map(txt).forEach(t => { if (t.length >= min) out.push(t); }); n = n.nextElementSibling; }
      return out;
    };
    const hi = grab(/^(?:the )?ingredients?\b/i, 3).map(bul).filter(l => l.length < 160), hs = grab(/^(?:instructions?|directions?|method|steps?|preparation|how to make)\b/i, 15).map(num);
    if (ing.length < 2) ing = hi; if (!steps.length) steps = hs;
  }
  if (ing.length < 2) return null;
  return { title: pageTitle(meta("og:title") || (dom.querySelector("h1") || {}).textContent || dom.title), source: url, image: ogImg, time: "", servings: "", ingredients: uniq(ing), steps: uniq(steps), tags: [] };
}

// One-click "Save to Garde" bookmarklet: runs in the visitor's own browser, so paywalls, bot-blocking and
// JavaScript-rendered pages don't matter. It opens Garde with the recipe already filled in.
export const bookmarklet = gardeUrl => "javascript:" + encodeURIComponent(
  "(function(){try{var f=" + extractRecipe.toString() + ";var r=f(document,location.href);if(!r){alert(\"Garde couldn't find a recipe on this page.\");return}" +
  "var s=btoa(unescape(encodeURIComponent(JSON.stringify(r)))).replace(/\\+/g,\"-\").replace(/\\//g,\"_\").replace(/=+$/,\"\");" +
  "window.open(" + JSON.stringify(gardeUrl) + "+\"#/import/\"+s,\"_blank\")}catch(e){alert(\"Garde error: \"+e.message)}})()");
