// store.js — שמירה קבועה ל-JSON. ב-Railway: Volume מותקן ב-DATA_DIR (למשל /data).
const fs = require("fs");
const path = require("path");

const DIR = process.env.DATA_DIR || path.join(__dirname, "data");
function ensure() { try { fs.mkdirSync(DIR, { recursive: true }); } catch (_) {} }
function file(name) { return path.join(DIR, name); }

function load(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), "utf8")); }
  catch (_) { return fallback; }
}
function save(name, obj) {
  ensure();
  try { fs.writeFileSync(file(name), JSON.stringify(obj, null, 2)); return true; }
  catch (e) { console.error("[store] save failed:", e.message); return false; }
}
module.exports = { load, save, DIR };
