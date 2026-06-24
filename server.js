// server.js
// Webhook ל-GREEN-API (ערוץ וואטסאפ). הרצה: npm run whatsapp
//   POST /webhook -> parseIncoming -> processToPdf -> sendDocument
//   על שגיאה -> sendText בעברית. השרת תמיד מחזיר 200 ל-GREEN-API.

const express = require("express");
const config = require("./config");
const { parseIncoming, sendText, sendDocument } = require("./wa");
const { processToPdf, friendlyError } = require("./pipeline");

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => res.send("Cake-Tags webhook is running"));
app.get("/health", (_req, res) => res.json({ ok: true }));

async function handleMessage(incoming) {
  const { chatId, text } = incoming;
  try {
    const { path, caption } = await processToPdf(text);
    await sendDocument(chatId, path, caption);
  } catch (err) {
    console.error("[error]", err.code || "", err.message);
    try {
      await sendText(chatId, friendlyError(err));
    } catch (e2) {
      console.error("[error] failed to send error message:", e2.message);
    }
  }
}

app.post(config.server.webhookPath, (req, res) => {
  res.sendStatus(200); // עונים מיד; מעבדים ברקע
  const incoming = parseIncoming(req.body);
  if (!incoming) return;
  handleMessage(incoming).catch((e) => console.error("[fatal]", e));
});

const port = config.server.port;
app.listen(port, () => {
  console.log(`Cake-Tags server listening on :${port}${config.server.webhookPath}`);
  console.log(`Templates: ${Object.keys(config.render.templates).join(", ")}`);
});

module.exports = { app, handleMessage };
