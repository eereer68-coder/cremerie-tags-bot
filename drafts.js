// drafts.js — מצב טיוטה לכל chatId, מותמד (store/Volume). + בניית טיוטה מה-AI + Quality Guard.
const store = require("./store");
const config = require("./config");
const products = require("./products");

// { items:[{name,description,template,qty}], chosenTemplate, lastPdf, history:[{path,caption,at}] }
let _state = store.load("drafts.json", {}) || {};
function persist() { store.save("drafts.json", _state); }

function get(chatId) { return _state[String(chatId)] || null; }
function set(chatId, draft) { _state[String(chatId)] = draft; persist(); return draft; }
function clear(chatId) { delete _state[String(chatId)]; persist(); }

// AI items -> draft items (ממלא תיאורים מהספרייה לפריטים מוכרים)
function buildItems(aiItems, defaultTemplate) {
  const def = defaultTemplate || config.render.defaultTemplate;
  const validKey = (k) => config.render.templates[k] ? k : null;
  return (aiItems || []).map((x) => {
    const prod = products.find(x.name);
    let description = x.description;
    if (!description && prod) description = products.describe(prod, x.descStyle) || "";
    const name = prod ? prod.name : x.name;
    const template = validKey(x.type) || (prod && validKey(prod.defaultTemplate)) || def;
    const missingDesc = !description;
    return { name, description, template, qty: Math.max(1, x.qty || 1), missingDesc };
  });
}

// Quality Guard — מקבל meta מהרינדור, מחזיר רשימת בעיות ידידותית
function qualityIssues(meta, items) {
  const issues = [];
  (meta || []).forEach((m) => {
    if (m.truncated) issues.push(`⚠️ "${m.name}": התיאור ארוך מדי ונחתך. כדאי לקצר.`);
    else if (m.descSize <= config.render.minFontPx + 0.01) issues.push(`⚠️ "${m.name}": התיאור ארוך, הפונט הוקטן מאוד.`);
  });
  (items || []).forEach((t) => {
    if (t.missingDesc) issues.push(`❓ "${t.name}": חסר תיאור. רוצה שאכתוב לך אחד?`);
    if (!config.render.templates[t.template]) issues.push(`❓ "${t.name}": חסר/לא ברור סוג תבנית.`);
  });
  return issues;
}

module.exports = { get, set, clear, buildItems, qualityIssues };
