// lib/ai.js — שכבת AI: שיחה טבעית + הפקת תגיות + תיאורים פרימיום + תיקון כתיב.
// תומך Gemini (חינמי) / Anthropic. פעיל רק אם הוגדר מפתח.
const config = require("./config");

function provider() {
  if (config.ai.gemini.apiKey) return "gemini";
  if (config.ai.anthropic.apiKey) return "anthropic";
  return null;
}
const enabled = () => provider() !== null;

function buildPrompt(userText) {
  const tpls = Object.entries(config.render.templates)
    .map(([k, t]) => `- "${k}" = ${t.label} (${(t.aliases || []).join(", ")})`)
    .join("\n");
  return (
`אתה העוזר החביב של מאפיית Cremerie בטלגרם. דבר עברית, בחום ובקיצור.
המשתמש כותב לך חופשי. החזר אך ורק JSON תקין (בלי טקסט נוסף, בלי \`\`\`), במבנה:
{"reply": "משפט קצר וטבעי בעברית", "items": [{"name":"שם קצר","description":"תיאור","type":"מפתח"}]}

חוקים:
- אם המשתמש מבקש להכין תגית/תגיות לעוגות/קינוחים — מלא את items, ו-reply יהיה אישור קצר ונחמד.
- אם זו רק שיחה/שאלה/ברכה — items=[] ו-reply עונה בנחמדות (ואפשר להציע לכתוב מה מכינים היום).
- name: 2-4 מילים. description: תיאור פרימיום אלגנטי אך תמציתי מאוד — עד 8 מילים, שורה אחת אם אפשר (יש מעט מקום בתגית). תקן שגיאות כתיב.
- אם אין תיאור — כתוב תיאור פרימיום קצר לפי השם.
- type אחד מהמפתחות; אם לא ברור -> "${config.render.defaultTemplate}".
- בלי הסימן %, כתוב "אחוז". בלי אימוג'ים בתוך התגית.
סוגים:
${tpls}

הודעת המשתמש:
${userText}`
  );
}

async function callGemini(prompt) {
  const { apiKey, model } = config.ai.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: config.ai.maxTokens } }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return (((d.candidates || [])[0] || {}).content || {}).parts?.[0]?.text || "";
}

async function anthropicOnce(prompt, model) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": config.ai.anthropic.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: config.ai.maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  return res;
}

async function callAnthropic(prompt) {
  const a = config.ai.anthropic;
  const models = [a.model, ...(a.fallbackModels || [])].filter((m, i, arr) => m && arr.indexOf(m) === i);
  let lastErr = "";
  for (const m of models) {
    const res = await anthropicOnce(prompt, m);
    if (res.ok) { const d = await res.json(); return (d.content || []).map((c) => c.text || "").join(""); }
    const body = await res.text();
    lastErr = `${res.status}: ${body}`;
    // אם המודל לא קיים -> ננסה את הבא; אחרת נעצור
    if (!/not_found|model/i.test(body)) break;
  }
  throw new Error(`Anthropic ${lastErr}`);
}

function extractJson(text) {
  if (!text) return null;
  let t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try { return JSON.parse(t); } catch (_) { return null; }
}

// analyze(text) -> { reply, items:[{name,description,type}] }
async function analyze(userText) {
  const p = provider();
  if (!p) throw new Error("AI לא מופעל");
  const prompt = buildPrompt(userText);
  const raw = p === "gemini" ? await callGemini(prompt) : await callAnthropic(prompt);
  const obj = extractJson(raw) || {};
  const items = Array.isArray(obj.items) ? obj.items
    .filter((x) => x && x.name)
    .map((x) => ({ name: String(x.name).trim(), description: String(x.description || "").trim(), type: x.type })) : [];
  const reply = typeof obj.reply === "string" ? obj.reply.trim() : "";
  return { reply, items };
}

module.exports = { enabled, provider, analyze };
