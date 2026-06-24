// lib/textLayout.js
// ----------------------------------------------------------------------------
// פריסת טקסט עברי (RTL) לקווי-מתאר וקטוריים מתוך הפונט (Rimona), בעזרת opentype.js.
//
// למה קווי-מתאר ולא טקסט חי? כדי שהפלט יהיה זהה פיקסל-בפיקסל בכל מנוע/מדפסת,
// בלי תלות בפריסת ה-RTL/kerning של הדפדפן. גישה זו אומתה מול ה-.ai המקורי.
//
// יכולות:
//   - lineToPaths : שורה אחת -> <path> ממורכז לפי דיו (ink) סביב cx, על baseline נתון
//   - measureWidth: רוחב מחרוזת ביחידות ה-SVG
//   - fitName     : הקטנת גודל הכותרת אם רחבה מדי
//   - fitDescription: גלישת שורות + הקטנת גודל אוטומטית עד שנכנס
// ----------------------------------------------------------------------------

const opentype = require("opentype.js");

function loadFonts(renderCfg) {
  return {
    bold: opentype.loadSync(renderCfg.fonts.bold),
    regular: opentype.loadSync(renderCfg.fonts.regular),
  };
}

// רוחב מחרוזת (יחידות SVG) לפי advance widths, כולל מתיחה אופקית
function measureWidth(font, text, size, xScale = 1) {
  let w = 0;
  for (const ch of [...text]) {
    const g = font.charToGlyph(ch);
    w += g.advanceWidth || 0;
  }
  return (w / font.unitsPerEm) * size * xScale;
}

/**
 * lineToPaths — שורת טקסט אחת -> מחרוזת <path> אחת או יותר.
 * הטקסט ממורכז לפי תיבת-הדיו (ink bbox) סביב cx, וקו הבסיס ב-baseline.
 * RTL: סדר חזותי = היפוך הסדר הלוגי (מתאים לעברית עם רווחים/פיסוק בסיסי).
 */
function lineToPaths(font, text, size, cx, baseline, xScale = 1, anchor = "center", dir = "rtl") {
  const chars = [...text];
  const order = dir === "ltr" ? chars.map((_, i) => i) : chars.map((_, i) => i).reverse(); // RTL=היפוך, LTR=כסדר (לספרות)
  const scale = size / font.unitsPerEm;

  let x = 0;
  let inkLo = Infinity;
  let inkHi = -Infinity;
  const items = [];

  for (const i of order) {
    const g = font.charToGlyph(chars[i]);
    const adv = (g.advanceWidth || 0) * scale * xScale;
    const p = g.getPath(0, 0, size); // baseline ב-0, קואורדינטות y כלפי מטה
    const bb = p.getBoundingBox();
    if (isFinite(bb.x1) && bb.x2 > bb.x1) {
      const lo = x + bb.x1 * xScale;
      const hi = x + bb.x2 * xScale;
      if (lo < inkLo) inkLo = lo;
      if (hi > inkHi) inkHi = hi;
    }
    const d = p.toPathData(3);
    if (d && d !== "") items.push({ x, d });
    x += adv;
  }
  if (!isFinite(inkLo)) {
    inkLo = 0;
    inkHi = 0;
  }
  let shift;
  if (anchor === "left") shift = cx - inkLo;        // קצה דיו שמאלי ב-cx
  else if (anchor === "right") shift = cx - inkHi;  // קצה דיו ימני ב-cx
  else shift = cx - (inkLo + inkHi) / 2;            // מרכוז לפי דיו

  const paths = items.map(
    (it) =>
      `<path d="${it.d}" transform="translate(${(it.x + shift).toFixed(4)} ${baseline.toFixed(
        4
      )}) scale(${xScale} 1)"/>`
  );
  return { svg: paths.join(""), inkWidth: inkHi - inkLo, advanceWidth: x };
}

// גלישת מילים לשורות שכל אחת <= maxWidth (ביחידות SVG)
function wrapWords(font, text, size, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (!cur || measureWidth(font, trial, size) <= maxWidth) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * fitName — מחזיר גודל פונט לכותרת שנכנס ל-maxWidth (הקטנה הדרגתית עד minPx).
 */
function fitName(font, text, nameCfg, minPx, step) {
  let size = nameCfg.size;
  while (size >= minPx) {
    if (measureWidth(font, text, size, nameCfg.xScale || 1) <= nameCfg.maxWidth) return size;
    size = Math.round((size - step) * 100) / 100;
  }
  return minPx;
}

/**
 * fitDescription — מחזיר { lines, size }.
 * מקטין גודל בהדרגה עד שהטקסט נכנס ל-maxLines שורות שכולן <= maxWidth.
 * אם גם ב-minPx לא נכנס — חותך ל-maxLines שורות.
 */
function fitDescription(font, text, descCfg, minPx, step) {
  let size = descCfg.size;
  while (size >= minPx) {
    const lines = wrapWords(font, text, size, descCfg.maxWidth);
    const widest = lines.length ? Math.max(...lines.map((l) => measureWidth(font, l, size))) : 0;
    if (lines.length <= descCfg.maxLines && widest <= descCfg.maxWidth + 0.5) {
      return { lines, size, truncated: false };
    }
    size = Math.round((size - step) * 100) / 100;
  }
  const lines = wrapWords(font, text, minPx, descCfg.maxWidth);
  const truncated = lines.length > descCfg.maxLines;
  return { lines: lines.slice(0, descCfg.maxLines), size: minPx, truncated };
}

module.exports = {
  loadFonts,
  measureWidth,
  lineToPaths,
  wrapWords,
  fitName,
  fitDescription,
};
