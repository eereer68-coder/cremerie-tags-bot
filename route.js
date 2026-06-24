// lib/route.js — מיפוי שם/כינוי תבנית למפתח, ובחירת תבנית מהשורה הראשונה.
const config = require("./config");

// "עוגה"/"קינוח"/"cakes"... -> מפתח טמפלייט, או null אם לא מוכר
function resolveTemplateName(value) {
  if (!value) return null;
  const want = String(value).trim().toLowerCase();
  for (const [key, t] of Object.entries(config.render.templates)) {
    const names = [key, t.label, ...(t.aliases || [])].map((s) => String(s).toLowerCase());
    if (names.includes(want)) return key;
  }
  return null;
}

// תאימות לאחור: שורה ראשונה "תבנית: X"
function resolveTemplate(rawText) {
  const def = config.render.defaultTemplate;
  if (!rawText) return { templateKey: def, text: rawText, explicit: false };
  const lines = String(rawText).split(/\r?\n/);
  const m = lines[0].match(/^\s*(?:תבנית|סוג|template)\s*[:：]\s*(.+?)\s*$/i);
  if (!m) return { templateKey: def, text: rawText, explicit: false };
  const key = resolveTemplateName(m[1]) || def;
  return { templateKey: key, text: lines.slice(1).join("\n"), explicit: true };
}

module.exports = { resolveTemplate, resolveTemplateName };
