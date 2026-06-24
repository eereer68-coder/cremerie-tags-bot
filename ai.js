// ai.js — מוח "קרמית": הבנת בקשה -> טיוטה מובנית, עריכת טיוטה בשפה טבעית, תיקון כתיב.
// מחזיר JSON בלבד. תומך Gemini (חינמי) / Anthropic (עם fallback למודלים).
const config = require("./config");
const products = require("./products");

function provider() {
  if (config.ai.gemini.apiKey) return "gemini";
  if (config.ai.anthropic.apiKey) return "anthropic";
  return null;
}
const enabled = () => provider() !== null;

// --- ספקים ---
async function callGemini(prompt) {
  const { apiKey, model } = config.ai.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: config.ai.maxTokens } }) });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return (((d.candidates || [])[0] || {}).content || {}).parts?.[0]?.text || "";
}
async function callAnthropic(prompt) {
  const a = config.ai.anthropic;
  const models = [a.model, ...(a.fallbackModels || [])].filter((m, i, arr) => m && arr.indexOf(m) === i);
  let lastErr = "";
  for (const m of models) {
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": a.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: m, max_tokens: config.ai.maxTokens, messages: [{ role: "user", content: prompt }] }) });
    if (res.ok) { const d = await res.json(); return (d.content || []).map((c) => c.text || "").join(""); }
    const body = await res.text(); lastErr = `${res.status}: ${body}`;
    if (!/not_found|model/i.test(body)) break;
  }
  throw new Error(`Anthropic ${lastErr}`);
}
async function callAI(prompt) {
  return provider() === "gemini" ? callGemini(prompt) : callAnthropic(prompt);
}
function extractJson(text) {
  if (!text) return null;
  let t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try { return JSON.parse(t); } catch (_) { return null; }
}

function templateHint() {
  return Object.entries(config.render.templates)
    .map(([k, t]) => `"${k}"=${t.label}(${(t.aliases || []).join("/")})`).join("; ");
}
function productIndex() {
  return products.all().map((p) => `${p.name}${p.aliases && p.aliases.length ? " ("+p.aliases.join("/")+")" : ""}`).join("; ");
}

// ---- ניתוח הודעה חופשית -> טיוטה ----
function analyzePrompt(userText) {
  return (
`את "קרמית", העוזרת החכמה של מאפיית Cremerie. דברי עברית, בחום, בקיצור ובנימוס.
המשתמשת כותבת חופשי. החזירי אך ורק JSON תקין (בלי טקסט נוסף, בלי \`\`\`) במבנה:
{
 "intent": "create" | "edit" | "chat",
 "confidence": 0.0-1.0,
 "userReply": "משפט קצר וטבעי בעברית",
 "items": [ {"name":"שם נקי","description":"תיאור או ריק","type":"מפתח תבנית","qty":1,"known":true/false,"descStyle":"default|short|premium"} ],
 "missingFields": ["..."],
 "shouldRenderPdf": false
}

חוקים:
- תקני תמיד שגיאות כתיב — גם בשמות וגם בתיאורים.
- name = שם המוצר בלבד, נקי. בלי מילים שמתארות סוג/גודל ("עוגה","קינוח","גדול","אישי") — אלה ל-type.
- אם השם תואם מוצר מוכר מהרשימה למטה — החזירי את השם הקנוני המדויק, known=true, ואל תכתבי description (המערכת תמלא מהספרייה). אם המשתמשת ביקשה "יוקרתי/פרימיום" -> descStyle="premium"; "קצר" -> "short".
- אם המוצר לא מוכר (known=false): אם המשתמשת נתנה פרטים — נסחי תיאור קצר ומדויק מהם. אם לא — תני תיאור כללי ומפתה בלי להמציא רכיבים ספציפיים שלא נכתבו, והוסיפי "description:<name>" ל-missingFields.
- qty: אם נכתב "כפול 4"/"×4"/"4 יחידות" -> qty=4.
- type לכל פריט: עוגה/גדול->cakes, קינוח/אישי->desserts; אם לא ברור-> ברירת מחדל "${config.render.defaultTemplate}".
- intent="edit" אם זו בקשת עריכה לטיוטה קיימת (אבל בד"כ זה מטופל בנפרד). intent="chat" אם זו רק שיחה/שאלה (items=[]).
- confidence נמוך (<0.5) אם לא ברור מה רוצים — אז shouldRenderPdf=false ו-userReply שואל שאלה מבהירה.
- תיאור: עד 8 מילים, שורה אחת, סגנון פרימיום-אך-תמציתי. בלי הסימן %, כתבי "אחוז". בלי גרש/אפוסטרוף (כתבי "פאדגי" בלי גרש). בלי אימוג'ים בתוך התגית.

תבניות: ${templateHint()}
מוצרים מוכרים: ${productIndex()}

הודעת המשתמשת:
${userText}`
  );
}

async function analyze(userText) {
  if (!provider()) throw new Error("AI לא מופעל");
  const raw = await callAI(analyzePrompt(userText));
  const o = extractJson(raw) || {};
  const items = Array.isArray(o.items) ? o.items.filter((x) => x && x.name).map((x) => ({
    name: String(x.name).trim(),
    description: String(x.description || "").trim(),
    type: x.type, qty: Math.max(1, parseInt(x.qty, 10) || 1),
    known: !!x.known, descStyle: x.descStyle || "default",
  })) : [];
  return {
    intent: o.intent || (items.length ? "create" : "chat"),
    confidence: typeof o.confidence === "number" ? o.confidence : (items.length ? 0.8 : 0.4),
    userReply: typeof o.userReply === "string" ? o.userReply.trim() : "",
    items,
    missingFields: Array.isArray(o.missingFields) ? o.missingFields : [],
    shouldRenderPdf: !!o.shouldRenderPdf,
  };
}

// ---- עריכת טיוטה בשפה טבעית ----
function editPrompt(draftItems, instruction) {
  const draft = draftItems.map((t, i) =>
    `${i + 1}. שם: ${t.name} | תיאור: ${t.description} | סוג: ${t.template} | כמות: ${t.qty || 1}`).join("\n");
  return (
`את "קרמית". לפניך טיוטת תגיות, והוראת עריכה בשפה חופשית. החזירי אך ורק JSON:
{"items":[{"name":"","description":"","type":"מפתח","qty":1}], "userReply":"משפט קצר"}

כללי עריכה (בצעי בדיוק את מה שביקשו):
- "שנה תיאור מספר 2 ל..." -> עדכני תיאור של פריט 2.
- "מחק את 3" -> הסירי פריט 3.
- "שכפל את 1 כפול 4" -> qty=4 לפריט 1.
- "שנה את כולם לקינוחים אישיים" -> type=desserts לכולם.
- "קצר את כל התיאורים" -> תיאורים קצרים יותר (עד 6 מילים).
- "תעשה תיאור יוקרתי יותר" -> תיאורים פרימיום אך תמציתיים.
- תקני שגיאות כתיב. בלי % (כתבי "אחוז"), בלי גרש/אפוסטרוף, בלי אימוג'ים בתגית.
- שמרי פריטים שלא נגעו בהם כפי שהם.
type: עוגה->cakes, קינוח->desserts.

טיוטה נוכחית:
${draft}

הוראת עריכה:
${instruction}`
  );
}
async function editDraft(draftItems, instruction) {
  if (!provider()) throw new Error("AI לא מופעל");
  const raw = await callAI(editPrompt(draftItems, instruction));
  const o = extractJson(raw) || {};
  const items = Array.isArray(o.items) ? o.items.filter((x) => x && x.name).map((x) => ({
    name: String(x.name).trim(), description: String(x.description || "").trim(),
    type: x.type, qty: Math.max(1, parseInt(x.qty, 10) || 1),
  })) : null;
  return { items, userReply: typeof o.userReply === "string" ? o.userReply.trim() : "" };
}

module.exports = { enabled, provider, analyze, editDraft };
