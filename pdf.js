// lib/pdf.js
// יצירת PDF A4 וקטורי מ-SVG — בלי דפדפן/Chromium (קל-משקל). הטקסט כבר קווי-מתאר.
const fs = require("fs");
const PDFDocument = require("pdfkit");
const SVGtoPDF = require("svg-to-pdfkit");

function pagesToPdf(pageSvgs, outPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 0 });
      const stream = fs.createWriteStream(outPath);
      doc.pipe(stream);
      pageSvgs.forEach((svg, i) => {
        if (i > 0) doc.addPage({ size: "A4", margin: 0 });
        // נסיר width/height כדי שה-viewBox (210x297) יקבע את הקנה-מידה אל דף ה-A4
        const clean = svg.replace(/\s(width|height)="[^"]*"/g, "");
        SVGtoPDF(doc, clean, 0, 0, {
          width: doc.page.width,
          height: doc.page.height,
          preserveAspectRatio: "xMidYMid meet",
          assumePt: true,
        });
      });
      doc.end();
      stream.on("finish", () => resolve(outPath));
      stream.on("error", reject);
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { pagesToPdf };
