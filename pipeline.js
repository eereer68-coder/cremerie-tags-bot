// lib/pipeline.js — ליבה משותפת: טקסט/מבנה -> PDF. כולל שכפול ×N.
const config = require("./config");
const { parseList } = require("./listParser");
const { resolveTemplateName } = require("./route");
const { renderTagsToPdf } = require("./renderer");

// שכפול לפי ×N בשם: "בלאק פורסט ×4" / "x4" / "*4"
function expandQuantities(tags) {
  const out = [];
  const max = config.render.maxQty || 24;
  for (const t of tags) {
    let name = t.name, qty = 1;
    const m = String(name).match(/\s*[x×*]\s*(\d{1,3})\s*$/i);
    if (m) { qty = Math.min(parseInt(m[1], 10) || 1, max); name = name.slice(0, m.index).trim(); }
    for (let i = 0; i < qty; i++) out.push({ ...t, name });
  }
  return out;
}

async function renderTags(tags, def) {
  tags = expandQuantities(tags);
  const result = await renderTagsToPdf(tags, { templateKey: def });
  const labelOf = (t) => config.render.templates[t.template || def].label;
  const usedLabels = [...new Set(tags.map(labelOf))];
  const caption = `הנה ${tags.length} תגיות (${usedLabels.join(", ")}). ${result.pages} עמ' A4 מוכן להדפסה 🎂`;
  const notes = [];
  result.meta.forEach((m) => {
    if (m.truncated) notes.push(`⚠️ "${m.name}": התיאור ארוך מדי ונחתך, כדאי לקצר.`);
    else if (m.descSize <= config.render.minFontPx + 0.01) notes.push(`ℹ️ "${m.name}": התיאור ארוך, הוקטן כדי להיכנס.`);
  });
  return { ...result, caption, count: tags.length, notes, tags, def };
}

async function processToPdf(rawText, templateOverride) {
  const def = templateOverride || config.render.defaultTemplate;
  const { tags, warnings } = parseList(rawText, def);
  const out = await renderTags(tags, def);
  (warnings || []).forEach((w) => out.notes.push(`ℹ️ ${w}`));
  return out;
}

async function processStructured(aiItems, templateOverride) {
  const def = templateOverride || config.render.defaultTemplate;
  const tags = (aiItems || [])
    .filter((x) => x && x.name && x.description)
    .map((x) => ({ name: x.name, description: x.description, template: resolveTemplateName(x.type) || def }));
  if (tags.length === 0) { const e = new Error("לא הצלחתי להפיק תגיות."); e.code = "NO_TAGS"; throw e; }
  return renderTags(tags, def);
}

// שימוש ל"שלח שוב" — מקבל tags מוכנים
async function reRender(tags, def) {
  return renderTags(tags, def || config.render.defaultTemplate);
}

function friendlyError(err) {
  const code = err && err.code;
  const map = {
    EMPTY_MESSAGE: 'ההודעה ריקה. שלחו רשימה עם "שם:" ו-"תיאור:".',
    NO_TAGS: 'לא זיהיתי תגית 🤔 כך שולחים:\n\nשם: בלאק פורסט\nתיאור: מוס שוקולד ודובדבני אמרנה\n\nאו פשוט כתבו לי חופשי מה צריך.',
    MISSING_NAME: 'לאחת התגיות חסר שם 🙂 הוסיפו "שם: ...".',
    MISSING_DESCRIPTION: 'לאחת התגיות חסר תיאור 🙂 הוסיפו "תיאור: ...".',
    TOO_MANY_TAGS: "יש הרבה מאוד תגיות, נסו פחות בכל פעם.",
    UNKNOWN_TEMPLATE: "סוג לא מוכר. אפשר: עוגות גדולות / קינוחים אישיים.",
    TEMPLATE_ART_MISSING: "תקלה זמנית בטמפלייט. נסו שוב.",
    PDF_RENDER_FAILED: "לא הצלחתי לייצר PDF. נסו שוב בעוד רגע.",
    PDF_NOT_CREATED: "לא הצלחתי לייצר PDF. נסו שוב בעוד רגע.",
  };
  return (code && map[code]) || (err && err.message) || "אופס, משהו השתבש. נסו שוב 🙏";
}


// רינדור טיוטה (פריטים עם qty) -> PDF. אפשרות לכבות/להדליק קווי חיתוך לבקשה זו בלבד.
async function renderDraft(items, opts = {}) {
  const def = opts.def || config.render.defaultTemplate;
  const tags = [];
  for (const it of items || []) {
    const n = Math.max(1, it.qty || 1);
    for (let i = 0; i < n; i++) tags.push({ name: it.name, description: it.description, template: it.template || def, prices: it.prices });
  }
  if (tags.length === 0) { const e = new Error("אין פריטים."); e.code = "NO_TAGS"; throw e; }
  let restore = null;
  if (typeof opts.cutLines === "boolean" && opts.cutLines !== config.page.cutLines) {
    restore = config.page.cutLines; config.page.cutLines = opts.cutLines;
  }
  try { return await renderTags(tags, def); }
  finally { if (restore !== null) config.page.cutLines = restore; }
}

module.exports = { processToPdf, processStructured, reRender, renderDraft, friendlyError };
