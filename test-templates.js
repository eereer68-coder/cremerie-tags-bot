// test-templates.js — בדיקות אוטומטיות לכל תבנית: שם/תיאור קצר+ארוך, PDF תקין. הרצה: node test-templates.js
const config = require("./config");
const { renderDraft } = require("./pipeline");
const fs = require("fs");

const SHORT = { name: "טארט", desc: "קרם לימון" };
const LONG = {
  name: "עוגת שוקולד בלגי משובחת במיוחד",
  desc: "שכבות מוס שוקולד בלגי 70 אחוז, גנאש חלב, קראמבל שקדים מקורמל, חמוץ-מתוק ופתיתי זהב מעל (מהדורה מוגבלת)",
};

(async () => {
  let ok = 0, fail = 0;
  const A = (c, m) => { c ? ok++ : (fail++, console.log("  ✗ " + m)); };
  for (const key of Object.keys(config.render.templates)) {
    for (const [label, t] of [["קצר", SHORT], ["ארוך", LONG]]) {
      const item = { name: t.name, description: t.desc, template: key, qty: 1 };
      if (key === "cookiepie") item.prices = ["38", "45"];
      try {
        const r = await renderDraft([item], { def: key });
        const valid = fs.existsSync(r.path) && fs.readFileSync(r.path).slice(0, 5).toString() === "%PDF-";
        const meta = r.meta[0];
        A(valid && r.pages >= 1, `${key}/${label} PDF תקין`);
        console.log(`  ✓ ${key}/${label}: שם ${meta.nameSize}px | תיאור ${meta.descSize}px x${meta.descLines.length}${meta.truncated ? " (נחתך)" : ""}`);
      } catch (e) { A(false, `${key}/${label}: ${e.message}`); }
    }
  }
  console.log(`\nסה"כ: ${ok} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
