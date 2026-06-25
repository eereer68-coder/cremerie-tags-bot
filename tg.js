// channels/telegram.js — אינטגרציה עם Telegram Bot API (כולל כפתורים/callback).
const fs = require("fs");
const path = require("path");
const config = require("./config");

const TOKEN = config.telegram.botToken;
const API = () => `https://api.telegram.org/bot${TOKEN}`;

function assertToken() {
  if (!TOKEN || TOKEN === "PUT_TELEGRAM_BOT_TOKEN_HERE")
    throw new Error("TELEGRAM_BOT_TOKEN חסר. צור בוט אצל @BotFather והכנס את הטוקן.");
}

// מחלץ עדכון נכנס: הודעת טקסט או לחיצת כפתור
function parseUpdate(update) {
  try {
    if (update && update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message && cq.message.chat && cq.message.chat.id;
      if (!chatId) return null;
      return { kind: "callback", chatId, data: cq.data || "", callbackId: cq.id };
    }
    const msg = update && (update.message || update.edited_message);
    if (!msg || !msg.chat) return null;
    const text = msg.text || msg.caption || null;
    if (!text) return null;
    return { kind: "message", chatId: msg.chat.id, text, senderName: (msg.from && msg.from.first_name) || "" };
  } catch (e) {
    return null;
  }
}

async function sendMessage(chatId, message, replyMarkup) {
  assertToken();
  const body = { chat_id: chatId, text: message };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(`${API()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage נכשל (${res.status}): ${await res.text()}`);
  return res.json();
}

async function answerCallback(callbackId, text) {
  assertToken();
  await fetch(`${API()}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text: text || "" }),
  }).catch(() => {});
}

async function sendDocument(chatId, filePath, caption = "") {
  assertToken();
  if (!fs.existsSync(filePath)) throw new Error(`קובץ לא נמצא לשליחה: ${filePath}`);
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  form.append("document", new Blob([buf], { type: "application/pdf" }), path.basename(filePath));
  const res = await fetch(`${API()}/sendDocument`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Telegram sendDocument נכשל (${res.status}): ${await res.text()}`);
  return res.json();
}

async function getUpdates(offset, timeout = 50) {
  assertToken();
  const res = await fetch(`${API()}/getUpdates?timeout=${timeout}&offset=${offset || 0}`);
  if (!res.ok) throw new Error(`Telegram getUpdates נכשל (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.result || [];
}

// תאימות לאחור
const sendText = (chatId, message) => sendMessage(chatId, message);

async function sendPhoto(chatId, filePath, caption = "") {
  assertToken();
  if (!fs.existsSync(filePath)) throw new Error(`קובץ לא נמצא לשליחה: ${filePath}`);
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  form.append("photo", new Blob([buf], { type: "image/png" }), path.basename(filePath));
  const res = await fetch(`${API()}/sendPhoto`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Telegram sendPhoto נכשל (${res.status}): ${await res.text()}`);
  return res.json();
}

module.exports = { parseUpdate, sendMessage, sendText, answerCallback, sendDocument, sendPhoto, getUpdates };
