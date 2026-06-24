// config.js — כל הפרמטרים במקום אחד.
const path = require("path");

const cakesLayout = {
  art: "cakes.svg",
  viewBox: { w: 213.1, h: 142.23 },
  name: { cx: 110.63, baseline: 43.14, size: 34.39, xScale: 1.02, weight: "bold", maxWidth: 196 },
  desc: {
    cx: 105.83, blockCenterY: 112.18, size: 13, lineHeight: 15.6, weight: "regular",
    maxWidth: 188, maxLines: 3, stroke: "#58595b", strokeWidth: 0.25,
  },
  fill: "#231f20",
};

module.exports = {
  telegram: { botToken: process.env.TELEGRAM_BOT_TOKEN || "PUT_TELEGRAM_BOT_TOKEN_HERE" },

  // ---- גישה (הרשמת מורשים) ----
  // ריק = פתוח לכולם. למשל: ALLOWED_CHAT_IDS="11111111,22222222"
  // כדי לגלות מזהה: שלחו לבוט /whoami
  access: {
    allowedChatIds: (process.env.ALLOWED_CHAT_IDS || "")
      .split(",").map((s) => s.trim()).filter(Boolean),
  },

  // ---- AI (אופציונלי) ----
  ai: {
    gemini: { apiKey: process.env.GEMINI_API_KEY || "", model: process.env.GEMINI_MODEL || "gemini-1.5-flash" },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      // ניתן לעקוף עם AI_MODEL; יש fallback אוטומטי אם המודל לא קיים בחשבון
      model: process.env.AI_MODEL || "claude-3-5-haiku-20241022",
      fallbackModels: ["claude-3-5-haiku-20241022", "claude-3-haiku-20240307", "claude-3-5-sonnet-20241022"],
    },
    maxTokens: 1024,
  },

  greenApi: {
    idInstance: process.env.GREENAPI_ID_INSTANCE || "PUT_ID_INSTANCE_HERE",
    apiToken: process.env.GREENAPI_API_TOKEN || "PUT_API_TOKEN_HERE",
    apiUrl: process.env.GREENAPI_API_URL || "https://api.green-api.com",
    mediaUrl: process.env.GREENAPI_MEDIA_URL || "https://media.green-api.com",
  },

  server: { port: process.env.PORT || 3000, webhookPath: "/webhook" },

  render: {
    defaultTemplate: "cakes",
    templates: {
      cakes: { label: "עוגות גדולות", aliases: ["עוגה", "עוגות", "גדולות", "cakes"], layout: cakesLayout },
      desserts: {
        label: "קינוחים אישיים",
        aliases: ["קינוח", "קינוחים", "אישיים", "desserts"],
        layout: { ...cakesLayout, art: "desserts.svg", viewBox: { w: 213.6, h: 142.73 }, name: { ...cakesLayout.name, size: 31 } },
      },
    },
    minFontPx: 9,
    fontShrinkStep: 0.5,
    maxQty: 24, // תקרה לשכפול ×N
    fonts: {
      bold: path.join(__dirname, "Rimona-Bold.ttf"),
      regular: path.join(__dirname, "Rimona-Regular.ttf"),
    },
  },

  page: {
    widthMm: 210, heightMm: 297, marginMm: 10, gutterMm: 5, cols: 2, maxRows: 4, rtl: true,
    cutLines: true, // קווי חיתוך עדינים סביב כל תגית
  },
  get maxTags() { return this.page.cols * this.page.maxRows; },

  paths: {
    root: __dirname,
    outputDir: path.join(__dirname, "output"),
    templatesDir: path.join(__dirname, "templates"),
  },
};
