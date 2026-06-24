// telegram-bot.js — בוט Cremerie: שיחה טבעית + כפתורים מינימליים + AI + הרשאות.
const config = require("./config");
const tg = require("./tg");
const ai = require("./ai");
const { processToPdf, processStructured, reRender, friendlyError } = require("./pipeline");

const chosen = new Map();  // chatId -> templateKey (מבחירת כפתור)
const last = new Map();    // chatId -> { tags, def } לשחזור
const EMOJI = { cakes: "🎂", desserts: "🍰", cupcakes: "🧁" };

function mainMenu() {
  const rows = Object.entries(config.render.templates).map(([k, t]) => [
    { text: `${EMOJI[k] || "🏷️"} ${t.label}`, callback_data: `tpl:${k}` },
  ]);
  rows.push([{ text: "❓ איך שולחים? דוגמה", callback_data: "help" }]);
  return { inline_keyboard: rows };
}
const againBtn = { inline_keyboard: [[{ text: "🔁 שלח שוב", callback_data: "again" }]] };

const GREETING =
  "היי, כיף שבאת! 🎂 אני הבוט של Cremerie להכנת תגיות להדפסה.\n" +
  (ai.enabled()
    ? "פשוט כתבו לי מה מכינים היום (למשל: \"תכין תגית לבלאק פורסט ולפבלובה קינוח\") ואחזיר PDF מוכן."
    : "בחרו סוג למטה ושלחו רשימה (שם + תיאור) — ואחזיר PDF מוכן.");

const EXAMPLE =
  "אפשר בפורמט מסודר:\n\nשם: בלאק פורסט\nתיאור: מוס שוקולד ודובדבני אמרנה\n\n" +
  "רשימה מעורבת? ציינו סוג לכל פריט (סוג: עוגה / סוג: קינוח). לשכפול: \"בלאק פורסט ×4\"." +
  (ai.enabled() ? "\n\nאו פשוט כתבו חופשי ואני אבין 😊" : "");

const isList = (t) => /שם\s*[:：]/.test(t || "");
const norm = (t) => (t || "").trim();
const isMenu = (t) => /^\/(start|menu)\b/i.test(norm(t)) || norm(t) === "תפריט" || norm(t) === "/help";
const isWhoami = (t) => /^\/whoami\b/i.test(norm(t));
const isAgain = (t) => norm(t) === "שוב" || norm(t) === "שלח שוב" || /^\/again\b/i.test(norm(t));

function allowed(chatId) {
  const list = config.access.allowedChatIds;
  return list.length === 0 || list.includes(String(chatId));
}

async function deliver(chatId, result) {
  last.set(chatId, { tags: result.tags, def: result.def });
  await tg.sendDocument(chatId, result.path, result.caption);
  if (result.notes && result.notes.length) await tg.sendMessage(chatId, result.notes.join("\n"));
  await tg.sendMessage(chatId, "מוכן ✓", againBtn);
}

async function onMessage(chatId, text, name) {
  console.log(`[msg] chatId=${chatId} name=${name || ""} : ${norm(text).slice(0, 60)}`);
  if (!allowed(chatId)) {
    return tg.sendMessage(chatId, "הבוט פרטי 🙂 פנו לבעל העסק לקבלת גישה.");
  }
  if (isWhoami(text)) return tg.sendMessage(chatId, `המזהה שלך: ${chatId}`);
  if (isMenu(text)) return tg.sendMessage(chatId, GREETING, mainMenu());
  if (isAgain(text)) {
    const l = last.get(chatId);
    if (!l) return tg.sendMessage(chatId, "אין עדיין דף לשחזר 🙂 שלחו רשימה ראשונה.");
    try { return await deliver(chatId, await reRender(l.tags, l.def)); }
    catch (e) { return tg.sendMessage(chatId, friendlyError(e)); }
  }

  if (isList(text)) {
    try { return await deliver(chatId, await processToPdf(text, chosen.get(chatId))); }
    catch (err) {
      console.error("[error]", err.code || "", err.message);
      return tg.sendMessage(chatId, friendlyError(err));
    }
  }

  if (ai.enabled() && norm(text).length > 1) {
    try {
      const { reply, items } = await ai.analyze(text);
      if (items && items.length) {
        if (reply) await tg.sendMessage(chatId, reply);
        return await deliver(chatId, await processStructured(items, chosen.get(chatId)));
      }
      return tg.sendMessage(chatId, reply || "לא בטוח שהבנתי 🙂 כתבו לי מה מכינים, או /menu לדוגמה.");
    } catch (err) {
      console.error("[ai error]", err.message);
      return tg.sendMessage(chatId, "רגע, הייתה תקלה קטנה ב-AI 🙏 אפשר לנסות שוב, או לשלוח רשימה מסודרת (/menu).");
    }
  }

  return tg.sendMessage(chatId, GREETING, mainMenu());
}

async function onCallback(chatId, data, callbackId) {
  await tg.answerCallback(callbackId);
  if (!allowed(chatId)) return;
  if (data === "help") return tg.sendMessage(chatId, EXAMPLE);
  if (data === "menu") return tg.sendMessage(chatId, GREETING, mainMenu());
  if (data === "again") {
    const l = last.get(chatId);
    if (!l) return tg.sendMessage(chatId, "אין עדיין דף לשחזר 🙂");
    try { return await deliver(chatId, await reRender(l.tags, l.def)); }
    catch (e) { return tg.sendMessage(chatId, friendlyError(e)); }
  }
  if (data.startsWith("tpl:")) {
    const key = data.slice(4);
    const t = config.render.templates[key];
    if (!t) return tg.sendMessage(chatId, "סוג לא מוכר.");
    chosen.set(chatId, key);
    return tg.sendMessage(chatId, `נבחר: ${EMOJI[key] || "🏷️"} ${t.label} ✓\nשלחו עכשיו את הרשימה.\n\n${EXAMPLE}`);
  }
}

async function handle(u) {
  if (u.kind === "callback") return onCallback(u.chatId, u.data, u.callbackId);
  if (u.kind === "message") return onMessage(u.chatId, u.text, u.senderName);
}

async function main() {
  console.log("Cremerie bot started. AI:", ai.enabled() ? ai.provider() : "off",
    "| access:", config.access.allowedChatIds.length ? config.access.allowedChatIds.join(",") : "open",
    "| templates:", Object.keys(config.render.templates).join(", "));
  try { require("./textLayout").loadFonts(config.render); } catch (_) {}
  let offset = 0;
  /* eslint-disable no-constant-condition */
  while (true) {
    try {
      const updates = await tg.getUpdates(offset, 50);
      for (const upd of updates) {
        offset = upd.update_id + 1;
        const u = tg.parseUpdate(upd);
        if (u) handle(u).catch((e) => console.error("[fatal]", e));
      }
    } catch (e) {
      console.error("[poll error]", e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
