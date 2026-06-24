// telegram-bot.js — "קרמית": עוזרת חכמה. טיוטה -> אישור -> עריכה -> זיכרון -> PDF.
const config = require("./config");
const tg = require("./tg");
const ai = require("./ai");
const products = require("./products");
const drafts = require("./drafts");
const { processToPdf, renderDraft, friendlyError } = require("./pipeline");

const BOT = "קרמית";
const EMOJI = { cakes: "🎂", desserts: "🍰", cupcakes: "🧁" };
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- helpers ----------
const norm = (t) => (t || "").trim();
const isList = (t) => /שם\s*[:：]/.test(t || "");
const isMenu = (t) => /^\/(start|menu|help)\b/i.test(norm(t)) || norm(t) === "תפריט";
const isWhoami = (t) => /^\/whoami\b/i.test(norm(t));
const isAgain = (t) => /^(שוב|שלח שוב|\/again)\b/i.test(norm(t));
const isHistory = (t) => /^(היסטוריה|\/history)\b/i.test(norm(t));
const validKey = (k) => (config.render.templates[k] ? k : null);
const isEditish = (t) => /^(שנה|תשנה|מחק|תמחק|הסר|הוסף|תוסיף|שכפל|תשכפל|כפול|קצר|תקצר|הארך|עדכן|החלף|תחליף|כולם|כולן|תעשה)\b/.test(norm(t)) || /יוקרת|פרימיום|קצר יותר/.test(norm(t));

function allowed(chatId) {
  const l = config.access.allowedChatIds;
  return l.length === 0 || l.includes(String(chatId));
}
function templatesMenu(prefix) {
  const rows = Object.entries(config.render.templates).map(([k, t]) => [{ text: `${EMOJI[k] || "🏷️"} ${t.label}`, callback_data: `${prefix}${k}` }]);
  return { inline_keyboard: rows };
}
const draftButtons = {
  inline_keyboard: [
    [{ text: "✅ הפק PDF", callback_data: "d:pdf" }],
    [{ text: "✏️ ערוך", callback_data: "d:edit" }, { text: "🔁 קצר תיאורים", callback_data: "d:short" }],
    [{ text: "🎨 שנה תבנית", callback_data: "d:chtpl" }, { text: "❌ בטל", callback_data: "d:cancel" }],
  ],
};
const postButtons = {
  inline_keyboard: [
    [{ text: "🔁 שלח שוב", callback_data: "p:again" }, { text: "✏️ ערוך את הדף", callback_data: "p:edit" }],
    [{ text: "✂️ בלי קווי חיתוך", callback_data: "p:nocut" }, { text: "✂️ עם קווי חיתוך", callback_data: "p:withcut" }],
    [{ text: "📚 היסטוריה", callback_data: "p:history" }],
  ],
};

const GREETING =
  `היי, אני ${BOT} — העוזרת של Cremerie 🍰\n` +
  "כתבי לי חופשי מה מכינים היום (למשל: \"בלאק פורסט, פבלובה כפול 4, וטארט לימון יוקרתי\"), " +
  "אסדר טיוטה, תאשרי — ואז אפיק PDF מוכן להדפסה.";

function draftText(items) {
  let s = "📝 הנה הטיוטה:\n";
  items.forEach((t, i) => {
    s += `\n${i + 1}. שם: ${t.name}\n   תיאור: ${t.description || "—"}\n   סוג: ${config.render.templates[t.template] ? config.render.templates[t.template].label : t.template}` +
      (t.qty > 1 ? ` | כמות: ${t.qty}` : "") + "\n";
  });
  s += "\nלאשר ולהפיק PDF?";
  return s;
}

function getDraft(chatId) { return drafts.get(chatId) || { items: [], history: [], lastResult: null, awaiting: null }; }
function saveDraft(chatId, d) { return drafts.set(chatId, d); }

// edit-output items -> draft items (map type->template, fill missing desc from library)
function mapEdited(items, def) {
  return (items || []).map((x) => {
    let description = x.description || "";
    const prod = products.find(x.name);
    if (!description && prod) description = products.describe(prod, "default") || "";
    return { name: prod ? prod.name : x.name, description, template: validKey(x.type) || def, qty: Math.max(1, x.qty || 1), missingDesc: !description };
  });
}

async function showDraft(chatId, d) {
  const issues = drafts.qualityIssues([], d.items);
  await tg.sendMessage(chatId, draftText(d.items), draftButtons);
  if (issues.length) await tg.sendMessage(chatId, issues.join("\n"));
}

async function deliver(chatId, d, result) {
  d.lastResult = { path: result.path, caption: result.caption, items: d.items, def: result.def };
  d.history = (d.history || []); d.history.unshift({ path: result.path, caption: result.caption, at: Date.now() });
  d.history = d.history.slice(0, 10);
  saveDraft(chatId, d);
  await tg.sendDocument(chatId, result.path, result.caption);
  const notes = (result.notes || []).concat(drafts.qualityIssues(result.meta, []));
  if (notes.length) await tg.sendMessage(chatId, notes.join("\n"));
  await tg.sendMessage(chatId, "מוכן ✓ מה עכשיו?", postButtons);
}

// ---------- admin ----------
async function tryAdmin(chatId, text) {
  let m;
  if (/^רשימת מוצרים\b/.test(text)) {
    await tg.sendMessage(chatId, "מוצרים בספרייה:\n• " + products.list().join("\n• ")); return true;
  }
  if ((m = text.match(/^מחק מוצר\s*[:：]?\s*(.+)$/))) {
    const ok = products.remove(m[1].trim());
    await tg.sendMessage(chatId, ok ? `נמחק: ${m[1].trim()} ✓` : "לא נמצא מוצר כזה."); return true;
  }
  if ((m = text.match(/^מוצר חדש\s*[:：]\s*(.+)$/s))) {
    // פורמט: מוצר חדש: שם | תיאור | סוג
    const parts = m[1].split("|").map((x) => x.trim());
    const [name, description, type] = parts;
    if (!name) { await tg.sendMessage(chatId, "פורמט: מוצר חדש: שם | תיאור | עוגה/קינוח"); return true; }
    const tkey = validKey(type) || (/(קינוח|אישי|desserts)/.test(type || "") ? "desserts" : "cakes");
    products.add({ name, defaultDescription: description || "", shortDescription: description || "", premiumDescription: description || "", defaultTemplate: tkey, aliases: [], keywords: [] });
    await tg.sendMessage(chatId, `נוסף לספרייה: ${name} (${config.render.templates[tkey].label}) ✓`); return true;
  }
  return false;
}

// ---------- main message handler ----------
async function onMessage(chatId, text, name) {
  log("[msg]", chatId, name || "", "|", norm(text).slice(0, 80));
  if (!allowed(chatId)) return tg.sendMessage(chatId, "הבוט פרטי 🙂 פני לבעל העסק לקבלת גישה.");
  if (isWhoami(text)) return tg.sendMessage(chatId, `המזהה שלך: ${chatId}`);
  if (isMenu(text)) return tg.sendMessage(chatId, GREETING, templatesMenu("settpl:"));

  const d = getDraft(chatId);

  if (isAgain(text)) {
    if (!d.lastResult) return tg.sendMessage(chatId, "אין עדיין דף לשחזר 🙂");
    return tg.sendDocument(chatId, d.lastResult.path, d.lastResult.caption);
  }
  if (isHistory(text)) return sendHistory(chatId, d);
  if (await tryAdmin(chatId, norm(text))) return;

  // עריכה טבעית: יש טיוטה והטקסט נראה כהוראת עריכה (גם בלי כפתור)
  if (d.items.length && (d.awaiting === "edit" || isEditish(text))) {
    d.awaiting = null;
    try {
      const { items, userReply } = await ai.editDraft(d.items, text);
      if (items && items.length) { d.items = mapEdited(items, config.render.defaultTemplate); saveDraft(chatId, d);
        if (userReply) await tg.sendMessage(chatId, userReply);
        return showDraft(chatId, d);
      }
    } catch (e) { log("[ai edit err]", e.message); }
    return tg.sendMessage(chatId, "לא הצלחתי לערוך 🙂 נסי שוב בניסוח אחר.");
  }

  // פורמט מסודר -> מצב מהיר (הפקה מיידית)
  if (isList(text)) {
    try { const r = await processToPdf(text);
      const dd = getDraft(chatId); dd.items = r.tags.map((t) => ({ name: t.name, description: t.description, template: t.template, qty: 1 }));
      return deliver(chatId, dd, r);
    } catch (err) { return tg.sendMessage(chatId, friendlyError(err)); }
  }

  // טקסט חופשי -> AI -> טיוטה לאישור
  if (ai.enabled() && norm(text).length > 1) {
    try {
      const a = await ai.analyze(text);
      if (a.intent === "chat" || a.confidence < 0.5 || !a.items.length) {
        return tg.sendMessage(chatId, a.userReply || "לא בטוחה שהבנתי 🙂 כתבי לי מה מכינים, או /menu לדוגמה.");
      }
      d.items = drafts.buildItems(a.items, config.render.defaultTemplate);
      d.awaiting = null; saveDraft(chatId, d);
      if (a.userReply) await tg.sendMessage(chatId, a.userReply);
      return showDraft(chatId, d);
    } catch (err) { log("[ai err]", err.message);
      return tg.sendMessage(chatId, "רגע, הייתה תקלה קטנה ב-AI 🙏 נסי שוב, או שלחי רשימה מסודרת (/menu).");
    }
  }
  return tg.sendMessage(chatId, GREETING, templatesMenu("settpl:"));
}

async function sendHistory(chatId, d) {
  if (!d.history || !d.history.length) return tg.sendMessage(chatId, "אין היסטוריה עדיין 🙂");
  const rows = d.history.slice(0, 6).map((h, i) => [{ text: `📄 ${new Date(h.at).toLocaleString("he-IL")}`, callback_data: `h:${i}` }]);
  return tg.sendMessage(chatId, "הדפים האחרונים:", { inline_keyboard: rows });
}

// ---------- callbacks ----------
async function onCallback(chatId, data, cbId) {
  await tg.answerCallback(cbId);
  if (!allowed(chatId)) return;
  const d = getDraft(chatId);

  if (data.startsWith("settpl:")) { // בחירת תבנית ברירת מחדל מהתפריט
    const k = data.slice(7); if (!validKey(k)) return;
    return tg.sendMessage(chatId, `נבחר ${config.render.templates[k].label}. כתבי מה מכינים ואסדר טיוטה 🙂`);
  }
  if (data.startsWith("h:")) {
    const h = (d.history || [])[parseInt(data.slice(2), 10)];
    if (h) return tg.sendDocument(chatId, h.path, "📄 " + h.caption);
    return tg.sendMessage(chatId, "הקובץ לא זמין יותר.");
  }

  // טיוטה
  if (data === "d:pdf") {
    if (!d.items.length) return tg.sendMessage(chatId, "אין טיוטה. כתבי מה מכינים 🙂");
    const missing = d.items.filter((t) => t.missingDesc);
    if (missing.length) return tg.sendMessage(chatId, `לפני הפקה — חסר תיאור ל: ${missing.map((t) => t.name).join(", ")}.\nכתבי "ערוך" והוסיפי תיאור, או "תכתבי תיאור ל${missing[0].name}".`);
    try { const r = await renderDraft(d.items, { def: config.render.defaultTemplate });
      d.awaiting = null; return deliver(chatId, d, r);
    } catch (e) { return tg.sendMessage(chatId, friendlyError(e)); }
  }
  if (data === "d:edit") { d.awaiting = "edit"; saveDraft(chatId, d);
    return tg.sendMessage(chatId, "כתבי מה לשנות 🙂\nלמשל: \"שנה תיאור 2 ל...\", \"מחק 3\", \"שכפל 1 כפול 4\", \"שנה את כולם לקינוחים\".");
  }
  if (data === "d:short" || data === "d:premium") {
    const instr = data === "d:short" ? "קצר את כל התיאורים" : "תעשה תיאור יוקרתי יותר";
    try { const { items } = await ai.editDraft(d.items, instr);
      if (items) { d.items = mapEdited(items, config.render.defaultTemplate); saveDraft(chatId, d); return showDraft(chatId, d); }
    } catch (e) { log(e.message); }
    return tg.sendMessage(chatId, "לא הצלחתי כרגע 🙂");
  }
  if (data === "d:chtpl") return tg.sendMessage(chatId, "לאיזה סוג לשנות את כל הפריטים?", templatesMenu("dtpl:"));
  if (data.startsWith("dtpl:")) { const k = data.slice(5); if (!validKey(k)) return;
    d.items = d.items.map((t) => ({ ...t, template: k })); saveDraft(chatId, d); return showDraft(chatId, d);
  }
  if (data === "d:cancel") { drafts.clear(chatId); return tg.sendMessage(chatId, "ביטלתי 🙂 כתבי מתי שתרצי."); }

  // אחרי PDF
  if (data === "p:again") { if (d.lastResult) return tg.sendDocument(chatId, d.lastResult.path, d.lastResult.caption); return; }
  if (data === "p:edit") { d.awaiting = "edit"; saveDraft(chatId, d); return tg.sendMessage(chatId, "כתבי מה לשנות בדף 🙂"); }
  if (data === "p:nocut" || data === "p:withcut") {
    if (!d.items.length) return tg.sendMessage(chatId, "אין דף פעיל.");
    try { const r = await renderDraft(d.items, { def: config.render.defaultTemplate, cutLines: data === "p:withcut" });
      return deliver(chatId, d, r);
    } catch (e) { return tg.sendMessage(chatId, friendlyError(e)); }
  }
  if (data === "p:history") return sendHistory(chatId, d);
}

async function handle(u) {
  if (u.kind === "callback") return onCallback(u.chatId, u.data, u.callbackId);
  if (u.kind === "message") return onMessage(u.chatId, u.text, u.senderName);
}

async function main() {
  log(`${BOT} started. AI:`, ai.enabled() ? ai.provider() : "off",
    "| access:", config.access.allowedChatIds.length ? config.access.allowedChatIds.join(",") : "open",
    "| templates:", Object.keys(config.render.templates).join(","),
    "| products:", products.list().length);
  try { require("./textLayout").loadFonts(config.render); } catch (_) {}
  let offset = 0;
  /* eslint-disable no-constant-condition */
  while (true) {
    try {
      const updates = await tg.getUpdates(offset, 50);
      for (const upd of updates) { offset = upd.update_id + 1; const u = tg.parseUpdate(upd); if (u) handle(u).catch((e) => log("[fatal]", e)); }
    } catch (e) { log("[poll err]", e.message); await new Promise((r) => setTimeout(r, 3000)); }
  }
}
main().catch((e) => { log("[fatal]", e); process.exit(1); });
