// Ingredient parsing, scaling, aisle sorting and list combining
const FRC = { "¼": .25, "½": .5, "¾": .75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": .125 };
const num = s => {
  s = s.trim(); let m;
  if ((m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s))) return +m[1] + m[2] / m[3];
  if ((m = /^(\d+)\/(\d+)$/.exec(s))) return m[1] / m[2];
  if ((m = /^(\d*)([¼½¾⅓⅔⅛])$/.exec(s))) return (+m[1] || 0) + FRC[m[2]];
  return parseFloat(s);
};
const NUM = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d*[¼½¾⅓⅔⅛]|\\d+(?:\\.\\d+)?)";
const UNITS = "cups?|c|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|liters?|cloves?|cans?|sticks?|slices?|pinch(?:es)?|dash(?:es)?|bunch(?:es)?|heads?|handfuls?|sprigs?|packages?";
const ING = new RegExp(`^(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?\\s*(${UNITS})?\\.?\\s+(.+)$`, "i");
const UMAP = { c: "cup", cup: "cup", cups: "cup", tbsp: "tbsp", tbsps: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", tsp: "tsp", tsps: "tsp", teaspoon: "tsp", teaspoons: "tsp", oz: "oz", ounce: "oz", ounces: "oz", lb: "lb", lbs: "lb", pound: "lb", pounds: "lb", g: "g", gram: "g", grams: "g", kg: "kg", ml: "ml", l: "l", liter: "l", liters: "l" };
const unitKey = u => { if (!u) return ""; const k = u.toLowerCase(); return UMAP[k] || k.replace(/ches$/, "ch").replace(/shes$/, "sh").replace(/s$/, ""); };

export function parseIng(line) {
  const m = ING.exec(String(line).trim()); if (!m) return null;
  const q1 = num(m[1]); if (!isFinite(q1)) return null;
  return { q1, q2: m[2] ? num(m[2]) : null, unit: unitKey(m[3]), name: m[4].trim() };
}

const FR = [[0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"], [1, ""]];
export function fmt(n) {
  if (n >= 10) return String(Math.round(n * 10) / 10).replace(/\.0$/, "");
  const w = Math.floor(n), f = n - w; let best = FR[0];
  for (const x of FR) if (Math.abs(x[0] - f) < Math.abs(best[0] - f)) best = x;
  if (best[0] === 1) return String(w + 1);
  return (w || "") + best[1] || String(Math.round(n * 100) / 100);
}

const ABBR = new Set(["tbsp", "tsp", "oz", "lb", "g", "kg", "ml", "l"]);
export const unitLabel = (u, q) => !u ? "" : (q <= 1 || ABBR.has(u)) ? u : /(ch|sh)$/.test(u) ? u + "es" : u + "s";
export const pluralName = name => {
  const [head, ...rest] = name.split(","), w = head.trim().split(" ");
  if (w.some(x => /[^s]s$/i.test(x))) return name;
  const l = w.length - 1; w[l] += /^(tomato|potato)$/i.test(w[l]) ? "es" : "s";
  return [w.join(" "), ...rest].join(",");
};

export function scaleLine(line, k) {
  const p = parseIng(line); if (!p || Math.abs(k - 1) < 1e-6) return line;
  const q1 = p.q1 * k, q2 = p.q2 != null ? p.q2 * k : null, top = q2 ?? q1;
  const name = !p.unit && top > 1 ? pluralName(p.name) : p.name;
  return `${fmt(q1)}${q2 != null ? "–" + fmt(q2) : ""} ${p.unit ? unitLabel(p.unit, top) + " " : ""}${name}`;
}

const AISLES = [
  ["Frozen", /\bfrozen\b/],
  ["Spices & seasoning", /\b(salt|black pepper|white pepper|pepper flakes|chili flakes|paprika|cumin|oregano|cinnamon|curry powder|turmeric|nutmeg|cayenne|chili powder|garam masala|bay leaf|bay leaves|seasoning|vanilla|dried (?:thyme|basil|parsley))\b/],
  ["Pantry staples", /\b(rice|pasta|spaghetti|penne|noodles?|flour|sugar|oats?|beans?|chickpeas?|lentils?|stock|broth|oil|vinegar|soy sauce|honey|maple syrup|tomato paste|coconut milk|diced tomatoes|crushed tomatoes|canned|baking (?:powder|soda)|cornstarch|breadcrumbs|nuts?|almonds?|peanut butter|olives?|mayo|mustard|ketchup|sauce|syrup)\b/],
  ["Dairy & eggs", /\b(butter|milk|cheese|parmesan|feta|mozzarella|cheddar|cream|yogurt|eggs?|ricotta)\b/],
  ["Meat & seafood", /\b(chicken|beef|pork|bacon|sausage|turkey|ham|lamb|steak|salmon|shrimp|fish|tuna|cod)\b/],
  ["Bakery", /\b(bread|tortillas?|buns?|pita|bagels?|naan|rolls?)\b/],
  ["Produce", /\b(garlic|onions?|shallots?|scallions?|lemons?|limes?|oranges?|tomato(?:es)?|potato(?:es)?|carrots?|celery|cucumbers?|peppers?|spinach|kale|lettuce|cabbage|avocados?|basil|parsley|cilantro|mint|thyme|rosemary|ginger|mushrooms?|bananas?|apples?|berries|zucchini|broccoli|cauliflower|peas|corn|herbs?|chives|dill|greens?|squash)\b/]
];
export const ORDER = ["Produce", "Meat & seafood", "Dairy & eggs", "Bakery", "Pantry staples", "Spices & seasoning", "Frozen", "Other"];
export const aisleOf = (name, unit) => { const n = name.toLowerCase(); if (unit === "can") return "Pantry staples"; for (const [a, re] of AISLES) if (re.test(n)) return a; return "Other"; };

// Combine chosen recipes (scaled to their target servings) into aisle groups
// "I always have this": a name matches a staple when it is the same, or contains it as whole words (salt hides kosher salt)
export const normName = n => String(n).toLowerCase().replace(/\(.*?\)/g, "").split(",")[0].trim().replace(/([a-z]{3})s$/, "$1");
export const hasStaple = (name, have) => { const n = normName(name); return (have || []).some(h => h && (n === h || new RegExp("\\b" + h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(n))); };
export function buildList(recipes, serv, have = [], hidden = []) {
  const map = new Map();
  recipes.forEach(r => {
    const base = parseInt(r.servings) || 0, k = base ? (serv[r.id] || base) / base : 1;
    (r.ingredients || []).forEach(line => {
      const p = parseIng(line), nm = (p ? p.name : line).split(",")[0].replace(/\(.*?\)/g, "").trim(); if (!nm) return;
      const key = `${p ? p.unit : ""}|${nm.toLowerCase().replace(/([a-z]{3})s$/, "$1")}|${p ? "q" : "n"}`;
      const e = map.get(key) || { name: nm, unit: p ? p.unit : "", q: 0, counted: !!p, key };
      if (p) e.q += (p.q2 ?? p.q1) * k;
      map.set(key, e);
    });
  });
  const out = {}; map.forEach(e => { if (hasStaple(e.name, have)) { if (!hidden.includes(normName(e.name))) hidden.push(normName(e.name)); return; } (out[aisleOf(e.name, e.unit)] ||= []).push(e); });
  return out;
}
export const itemText = e => !e.counted ? e.name : [fmt(e.q), unitLabel(e.unit, e.q), !e.unit && e.q > 1 ? pluralName(e.name) : e.name].filter(Boolean).join(" ");

// ---- Unit conversion (US <-> metric) for the recipe page and cook mode ----
const rnd = v => v >= 20 ? Math.round(v / 5) * 5 : Math.round(v);
const dec = n => String(Math.round(n * 10) / 10).replace(/\.0$/, "");
function target(unit, top, system) {
  if (system === "metric") {
    const f = { cup: 240, tbsp: 15, tsp: 5, oz: 28.35, lb: 453.6 }[unit]; if (!f) return null;
    const base = unit === "oz" || unit === "lb" ? "g" : "ml", v = top * f;
    return v >= 1000 ? [base === "g" ? "kg" : "l", f / 1000] : [base, f];
  }
  if (unit === "g") return top >= 453.6 ? ["lb", 1 / 453.6] : ["oz", 1 / 28.35];
  if (unit === "kg") return ["lb", 2.2046];
  if (unit === "ml") return top >= 240 ? ["cup", 1 / 240] : top >= 15 ? ["tbsp", 1 / 15] : ["tsp", 1 / 5];
  if (unit === "l") return ["cup", 4.2268];
  return null;
}
export function convertLine(line, system) {
  if (system !== "metric" && system !== "imperial") return line;
  const p = parseIng(line); if (!p) return line;
  const t = target(p.unit, p.q2 ?? p.q1, system); if (!t) return line;
  const f = q => { const v = q * t[1]; return system === "metric" ? (t[0] === "kg" || t[0] === "l" ? Math.round(v * 10) / 10 : rnd(v)) : v; };
  const show = system === "metric" ? dec : fmt, a = f(p.q1), b = p.q2 != null ? f(p.q2) : null;
  return `${show(a)}${b != null ? "–" + show(b) : ""} ${unitLabel(t[0], b ?? a)} ${p.name}`;
}
export function convertText(text, system) {
  if (system !== "metric" && system !== "imperial") return text;
  return String(text).replace(/(\d{2,3})\s*(?:°|º|degrees)\s*([FC])\b/gi, (m, n, u) => {
    u = u.toUpperCase(); n = +n;
    if (system === "metric" && u === "F") return `${Math.round((n - 32) * 5 / 9 / 5) * 5}°C`;
    if (system === "imperial" && u === "C") return `${Math.round((n * 9 / 5 + 32) / 5) * 5}°F`;
    return m;
  });
}
