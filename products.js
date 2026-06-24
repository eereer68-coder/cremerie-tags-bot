// products.js — ספריית מוצרים קבועה (זיכרון מותמד דרך store).
// כל מוצר: { name, aliases, defaultDescription, shortDescription, premiumDescription, defaultTemplate, keywords }
const store = require("./store");

const SEED = [
  { name: "בלאק פורסט", aliases: ["בלק פורסט", "black forest"], defaultTemplate: "cakes",
    shortDescription: "מוס שוקולד ודובדבני אמרנה",
    defaultDescription: "שכבות מוס שוקולד ווניל ודובדבני אמרנה איטלקיים",
    premiumDescription: "מוס שוקולד בלגי קטיפתי, ביסקוויט קקאו ודובדבני אמרנה איטלקיים",
    keywords: ["שוקולד", "דובדבן"] },
  { name: "פבלובה", aliases: ["pavlova"], defaultTemplate: "desserts",
    shortDescription: "מרנג, קצפת ופירות יער",
    defaultDescription: "מרנג פריך, קצפת וניל ופירות יער טריים",
    premiumDescription: "מרנג פריך עם לב רך, קצפת מסקרפונה ופירות יער טריים",
    keywords: ["מרנג", "פירות יער"] },
  { name: "טארט לימון", aliases: ["tart lemon", "טרט לימון"], defaultTemplate: "cakes",
    shortDescription: "קרם לימון ובצק פריך",
    defaultDescription: "קרם לימון חמצמץ, מרנג איטלקי ובצק פריך",
    premiumDescription: "קרם לימון חמצמץ-מתוק, מרנג איטלקי קלוי ובצק שקדים פריך",
    keywords: ["לימון", "מרנג"] },
  { name: "סברינה", aliases: ["sabrina"], defaultTemplate: "desserts",
    shortDescription: "בצק ספוג, קצפת ודובדבן",
    defaultDescription: "בצק אווירירי ספוג בסירופ, קצפת ודובדבן",
    premiumDescription: "בצק אווירירי ספוג בסירופ ארומטי, קצפת עדינה ודובדבן",
    keywords: ["קצפת", "סירופ"] },
  { name: "עוגת פיסטוק", aliases: ["פיסטוק", "pistachio"], defaultTemplate: "cakes",
    shortDescription: "מוס פיסטוק ושוקולד לבן",
    defaultDescription: "מוס פיסטוק, שוקולד לבן וקראנץ שקדים",
    premiumDescription: "מוס פיסטוק עשיר, גנאש שוקולד לבן וקראנץ שקדים מקורמל",
    keywords: ["פיסטוק", "שקדים"] },
];

let _cache = null;
function all() {
  if (_cache) return _cache;
  const saved = store.load("products.json", null);
  _cache = Array.isArray(saved) ? saved : JSON.parse(JSON.stringify(SEED));
  return _cache;
}
function persist() { store.save("products.json", all()); }

const norm = (s) => String(s || "").trim().toLowerCase().replace(/[‎‏]/g, "");
function find(query) {
  const q = norm(query);
  if (!q) return null;
  for (const p of all()) {
    const names = [p.name, ...(p.aliases || [])].map(norm);
    if (names.includes(q)) return p;
  }
  // התאמה חלקית (שם מוכל)
  for (const p of all()) {
    const names = [p.name, ...(p.aliases || [])].map(norm);
    if (names.some((n) => n && (q.includes(n) || n.includes(q)))) return p;
  }
  return null;
}
// בחירת תיאור לפי סגנון: premium/short/default
function describe(p, style) {
  if (!p) return null;
  if (style === "premium" && p.premiumDescription) return p.premiumDescription;
  if (style === "short" && p.shortDescription) return p.shortDescription;
  return p.defaultDescription || p.shortDescription || p.premiumDescription || null;
}

function add(prod) {
  const list = all();
  const i = list.findIndex((p) => norm(p.name) === norm(prod.name));
  if (i >= 0) list[i] = { ...list[i], ...prod };
  else list.push(prod);
  persist(); return true;
}
function remove(name) {
  const list = all();
  const i = list.findIndex((p) => norm(p.name) === norm(name));
  if (i < 0) return false;
  list.splice(i, 1); persist(); return true;
}
function list() { return all().map((p) => p.name); }

module.exports = { all, find, describe, add, remove, list, persist };
