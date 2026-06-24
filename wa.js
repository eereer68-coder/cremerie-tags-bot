// channels/whatsapp.js
// ----------------------------------------------------------------------------
// אינטגרציה עם GREEN-API לוואטסאפ.
//
// יתרון GREEN-API על וואטסאפ הרשמי של Meta:
//   - אין צורך באישור עסקי / Business Verification
//   - אין טמפלייטים מאושרים
//   - אין חלון 24 שעות למענה
//   - שליחת קבצים (PDF) = קריאת HTTP פשוטה
//
// שתי פעולות עיקריות:
//   1. parseIncoming(body)  -> מחלץ { chatId, text, senderName } מ-webhook
//   2. sendDocument(chatId, filePath, caption) -> שולח PDF חזרה
//   3. sendText(chatId, text) -> שולח הודעת טקסט (לשגיאות)
// ----------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const config = require("./config");

const { idInstance, apiToken, apiUrl, mediaUrl } = config.greenApi;

// בונה URL לפעולת GREEN-API
function apiEndpoint(method) {
  return `${apiUrl}/waInstance${idInstance}/${method}/${apiToken}`;
}
function mediaEndpoint(method) {
  return `${mediaUrl}/waInstance${idInstance}/${method}/${apiToken}`;
}

/**
 * parseIncoming(body) -> { chatId, text, senderName } | null
 * מקבל את גוף ה-webhook של GREEN-API ומחלץ הודעת טקסט נכנסת.
 * מחזיר null אם זו לא הודעת טקסט רלוונטית (סטטוסים, אישורי מסירה וכו').
 */
function parseIncoming(body) {
  try {
    if (!body || body.typeWebhook !== "incomingMessageReceived") return null;

    const data = body.messageData || {};
    const sender = body.senderData || {};
    const chatId = sender.chatId; // למשל 9725XXXXXXXX@c.us

    let text = null;

    // הודעת טקסט רגילה
    if (data.typeMessage === "textMessage" && data.textMessageData) {
      text = data.textMessageData.textMessage;
    }
    // הודעת טקסט מורחבת (עם תצוגה מקדימה של קישור וכו')
    else if (data.typeMessage === "extendedTextMessage" && data.extendedTextMessageData) {
      text = data.extendedTextMessageData.text;
    }

    if (!text || !chatId) return null;

    return {
      chatId,
      text,
      senderName: sender.senderName || sender.chatName || "",
    };
  } catch (e) {
    return null;
  }
}

/**
 * sendText(chatId, message) -> Promise
 * שולח הודעת טקסט (משמש בעיקר להודעות שגיאה ידידותיות).
 */
async function sendText(chatId, message) {
  const res = await fetch(apiEndpoint("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GREEN-API sendMessage נכשל (${res.status}): ${t}`);
  }
  return res.json();
}

/**
 * sendDocument(chatId, filePath, caption) -> Promise
 * שולח קובץ (PDF) חזרה למשתמש דרך sendFileByUpload.
 */
async function sendDocument(chatId, filePath, caption = "") {
  if (!fs.existsSync(filePath)) {
    throw new Error(`קובץ לא נמצא לשליחה: ${filePath}`);
  }

  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  // GREEN-API מצפה ל-multipart/form-data ב-sendFileByUpload
  const form = new FormData();
  form.append("chatId", chatId);
  form.append("caption", caption);
  // Blob מתוך Buffer — נתמך ב-Node 18+
  const blob = new Blob([fileBuffer], { type: "application/pdf" });
  form.append("file", blob, fileName);

  const res = await fetch(mediaEndpoint("sendFileByUpload"), {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GREEN-API sendFileByUpload נכשל (${res.status}): ${t}`);
  }
  return res.json();
}

module.exports = { parseIncoming, sendText, sendDocument };
