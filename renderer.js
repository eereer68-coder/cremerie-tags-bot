// lib/renderer.js
// רינדור תגיות -> PDF A4 (וקטורי, בלי דפדפן).
//   tags[] -> אמנות הטמפלייט + שם+תיאור כקווי-מתאר -> גריד A4 RTL -> ריבוי עמודים -> pdfkit
// העיצוב מגיע מקובץ ה-SVG שמקורו ב-.ai. לא נבנה עיצוב חדש.

const fs = require("fs");
const path = require("path");
const config = require("./config");
const tl = require("./textLayout");
const cpPrice = require("./cookiepie_price");
const { pagesToPdf } = require("./pdf");

class RenderError extends Error {
  constructor(message, code) { super(message); this.name = "RenderError"; this.code = code; }
}

let _fonts = null;
function fonts() { if (!_fonts) _fonts = tl.loadFonts(config.render); return _fonts; }

const _artCache = {};
function loadTemplate(key, artFile) {
  const def = config.render.templates[key];
  if (!def) throw new RenderError(`טמפלייט לא מוכר: "${key}"`, "UNKNOWN_TEMPLATE");
  const artRel = artFile || def.layout.art;
  const cacheKey = key + "::" + artRel;
  if (_artCache[cacheKey]) return { def, ..._artCache[cacheKey] };
  const artPath = path.join(config.paths.root, artRel);
  if (!fs.existsSync(artPath))
    throw new RenderError(`קובץ האמנות של הטמפלייט חסר: ${def.layout.art}`, "TEMPLATE_ART_MISSING");
  const raw = fs.readFileSync(artPath, "utf8");
  const vbMatch = raw.match(/viewBox="([\d.\-\s]+)"/);
  let vb = def.layout.viewBox || { w: 213.1, h: 142.23 };
  if (vbMatch) { const p = vbMatch[1].trim().split(/\s+/).map(Number); vb = { w: p[2], h: p[3] }; }
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/i, "").replace(/<\/svg>\s*$/i, "");
  _artCache[cacheKey] = { viewBox: vb, inner };
  return { def, viewBox: vb, inner };
}


// סכומי קוקי פאי: ₪ קבוע (וקטור מהמקור) + ספרות מהפונט (LTR, עיגון-שמאל)
function buildCookiePiePrices(prices, boldFont) {
  const shekels = [cpPrice.shekelRow1, cpPrice.shekelRow2];
  let inner = "";
  for (let i = 0; i < Math.min(prices.length, cpPrice.rows.length); i++) {
    const amt = String(prices[i]).replace(/[^0-9]/g, "");
    if (!amt) continue;
    inner += `<path d="${shekels[i]}"/>`;
    inner += tl.lineToPaths(boldFont, amt, cpPrice.digitSize, cpPrice.digitLeftX, cpPrice.rows[i].baseline, 1, "left", "ltr").svg;
  }
  return inner ? `\n  <g fill="${cpPrice.fill}">${inner}</g>` : "";
}

function buildTagInner(tag, templateKey) {
  if (!tag || !tag.name) throw new RenderError("חסר שם בתגית.", "MISSING_NAME");
  if (!tag.description) throw new RenderError(`לתגית "${tag.name}" חסר תיאור.`, "MISSING_DESCRIPTION");
  const usePrices = templateKey === "cookiepie" && Array.isArray(tag.prices) && tag.prices.length >= 1;
  const _defTmp = config.render.templates[templateKey];
  const _artOverride = usePrices && _defTmp ? (_defTmp.layout.artNoPrice || null) : null;
  const { def, viewBox, inner } = loadTemplate(templateKey, _artOverride);
  const layout = def.layout;
  const f = fonts();
  const { minFontPx, fontShrinkStep } = config.render;

  const nameSize = tl.fitName(f.bold, tag.name, layout.name, minFontPx, fontShrinkStep);
  const nameRes = tl.lineToPaths(f.bold, tag.name, nameSize, layout.name.cx, layout.name.baseline, layout.name.xScale || 1);

  const fit = tl.fitDescription(f.regular, tag.description, layout.desc, minFontPx, fontShrinkStep);
  const k = fit.lines.length;
  const first = layout.desc.blockCenterY - ((k - 1) * layout.desc.lineHeight) / 2;
  const descPaths = fit.lines
    .map((line, j) => tl.lineToPaths(f.regular, line, fit.size, layout.desc.cx, first + layout.desc.lineHeight * j).svg)
    .join("");

  const strokeAttr = layout.desc.stroke
    ? ` stroke="${layout.desc.stroke}" stroke-width="${layout.desc.strokeWidth || 0.25}" stroke-miterlimit="10"`
    : "";

  let priceSvg = "";
  if (usePrices) priceSvg = buildCookiePiePrices(tag.prices, f.bold);

  const tagInner = inner +
    `\n  <g fill="${layout.fill}">${nameRes.svg}</g>` +
    `\n  <g fill="${layout.fill}"${strokeAttr}>${descPaths}</g>` +
    priceSvg;

  return { inner: tagInner, viewBox,
    meta: { name: tag.name, nameSize, descSize: fit.size, descLines: fit.lines, truncated: fit.truncated } };
}

const TAG_W_MM = 75.177;
function gridGeometry() {
  const p = config.page;
  const cols = p.cols;
  const sampleVb = { w: 213.1, h: 142.23 };
  const tagHmm = (sampleVb.h / sampleVb.w) * TAG_W_MM;
  const gridW = cols * TAG_W_MM + (cols - 1) * p.gutterMm;
  const gridH = p.maxRows * tagHmm + (p.maxRows - 1) * p.gutterMm;
  const startX = Math.max(p.marginMm, (p.widthMm - gridW) / 2);
  const startY = Math.max(p.marginMm, (p.heightMm - gridH) / 2);
  return { cols, tagHmm, startX, startY };
}

function composePageSvg(pageTags) {
  const p = config.page;
  const { cols, tagHmm, startX, startY } = gridGeometry();
  let cells = "";
  let guides = "";
  pageTags.forEach((t, i) => {
    const row = Math.floor(i / cols);
    let col = i % cols;
    if (p.rtl) col = cols - 1 - col;
    const xmm = startX + col * (TAG_W_MM + p.gutterMm);
    const ymm = startY + row * (tagHmm + p.gutterMm);
    const s = TAG_W_MM / t.viewBox.w;
    cells += `\n  <g transform="translate(${xmm.toFixed(3)} ${ymm.toFixed(3)}) scale(${s.toFixed(6)})">` + t.inner + `\n  </g>`;
    if (p.cutLines) {
      guides += `\n  <rect x="${xmm.toFixed(2)}" y="${ymm.toFixed(2)}" width="${TAG_W_MM.toFixed(2)}" height="${tagHmm.toFixed(2)}" ` +
        `fill="none" stroke="#c8c8c8" stroke-width="0.2" stroke-dasharray="1.2 1.2"/>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.widthMm}mm" height="${p.heightMm}mm" viewBox="0 0 ${p.widthMm} ${p.heightMm}">${guides}${cells}\n</svg>`;
}

function buildPageSvgs(tags, templateKey) {
  templateKey = templateKey || config.render.defaultTemplate;
  if (!Array.isArray(tags) || tags.length === 0) throw new RenderError("אין תגיות לרינדור.", "NO_TAGS");
  if (tags.length > 100) throw new RenderError("יותר מדי תגיות בבקשה אחת.", "TOO_MANY_TAGS");
  const built = tags.map((t) => buildTagInner(t, t.template || templateKey));
  const perPage = config.maxTags;
  const groups = [];
  for (let i = 0; i < built.length; i += perPage) groups.push(built.slice(i, i + perPage));
  const pageSvgs = groups.map((g) => composePageSvg(g));
  return { pageSvgs, pages: groups.length, meta: built.map((b) => b.meta) };
}

function buildHtml(tags, templateKey) {
  const { pageSvgs, pages, meta } = buildPageSvgs(tags, templateKey);
  const pageDivs = pageSvgs
    .map((svg, idx) => `<div class="page"${idx < pageSvgs.length - 1 ? ' style="page-break-after:always"' : ""}>${svg}</div>`)
    .join("\n");
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">` +
    `<style>@page{size:A4;margin:0} html,body{margin:0;padding:0} .page{width:210mm;height:297mm;overflow:hidden}</style>` +
    `</head><body>${pageDivs}</body></html>`;
  return { html, pages, meta };
}

async function renderTagsToPdf(tags, opts = {}) {
  const templateKey = opts.templateKey || config.render.defaultTemplate;
  const { pageSvgs, pages, meta } = buildPageSvgs(tags, templateKey);
  const outDir = config.paths.outputDir;
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = opts.outPath || path.join(outDir, `tags-${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`);
  try {
    await pagesToPdf(pageSvgs, outPath);
  } catch (e) {
    throw new RenderError(`רינדור ה-PDF נכשל: ${e.message}`, "PDF_RENDER_FAILED");
  }
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0)
    throw new RenderError("קובץ ה-PDF לא נוצר.", "PDF_NOT_CREATED");
  return { path: outPath, pages, meta };
}

module.exports = { renderTagsToPdf, buildPageSvgs, buildHtml, buildTagInner, composePageSvg, RenderError };
