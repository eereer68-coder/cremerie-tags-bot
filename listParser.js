// lib/listParser.js
// מנתח רשימת מוצרים עם אפשרות לציין סוג-תג לכל פריט:
//   תבנית: עוגות גדולות           (ברירת מחדל לכל הרשימה)
//   1.
//   שם: בלאק פורסט
//   תיאור: ...
//   סוג: קינוח                    (override לפריט הספציפי)
//   שם: סברינה
//   תיאור: ...
// מחזיר { tags:[{name,description,template}], warnings }.

const { parseMessage, ParseError } = require("./parser");
const { resolveTemplateName } = require("./route");

const RE_INDEX = /^\s*(תגית\s*)?\d+\s*[.)־-]?\s*$/;
const RE_HEADER = /^\s*תגי(ת|ות)\s*$/;
const RE_NAME = /^\s*שם\s*[:：]/;
const RE_TYPE = /^\s*(?:סוג(?:\s*תג)?|תבנית|type)\s*[:：]\s*(.+?)\s*$/i;

function parseList(rawText, defaultTemplate) {
  const lines = String(rawText || "").split(/\r?\n/);
  const blocks = [];
  const types = [];
  let cur = [];
  let hasName = false;
  let blockType; // override לבלוק הנוכחי
  let runningType = defaultTemplate; // ברירת מחדל זורמת

  const push = () => {
    if (cur.length) { blocks.push(cur.join("\n")); types.push(blockType || runningType); }
    cur = []; hasName = false; blockType = undefined;
  };

  for (const line of lines) {
    if (RE_HEADER.test(line)) continue;
    const tm = line.match(RE_TYPE);
    if (tm) {
      const key = resolveTemplateName(tm[1]);
      if (key) {
        if (cur.length === 0 && !hasName) runningType = key; // לפני פריט -> ברירת מחדל מכאן
        else blockType = key; // בתוך פריט -> override לפריט
      }
      continue; // משורת-הסוג לא נכנסת לטקסט שמועבר ל-parser
    }
    if (RE_INDEX.test(line)) { push(); continue; }
    if (RE_NAME.test(line) && hasName) push();
    if (RE_NAME.test(line)) hasName = true;
    cur.push(line);
  }
  push();

  const tags = [];
  const warnings = [];
  blocks.forEach((b, i) => {
    const res = parseMessage(b); // זורק ParseError אם פריט לא תקין
    (res.warnings || []).forEach((w) => warnings.push(w));
    res.tags.forEach((t) => { t.template = types[i]; tags.push(t); });
  });

  if (tags.length === 0) throw new ParseError('לא זוהתה אף תגית. ודאו שיש שורות "שם:" ו-"תיאור:".', "NO_TAGS");
  return { tags, warnings };
}

module.exports = { parseList };
