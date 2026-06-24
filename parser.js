// parser.js
// ניתוח הודעת וואטסאפ בעברית למבנה תגיות מסודר.
//
// פורמט נתמך (גמיש לרווחים, מספור, וסדר שורות):
//
//   תגיות
//   1.
//   שם: עוגת פיסטוק
//   תיאור: מוס פיסטוק, שוקולד לבן וקראנץ׳ שקדים
//   2.
//   שם: טארט לימון
//   תיאור: קרם לימון חמצמץ, מרנג איטלקי ובצק פריך
//
// גם הפורמט הישן (תגית בודדת בלי מספור) נתמך.

class ParseError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ParseError";
    this.code = code; // קוד שגיאה לזיהוי תכנותי
  }
}

// מסיר תווי כיווניות נסתרים (LRM/RLM/LRE...) ורווחים מיותרים
function clean(s) {
  if (s == null) return "";
  return String(s)
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

// האם השורה היא כותרת "שם:" — תומך בשם / שֵם / רווחים סביב הנקודתיים
function matchName(line) {
  const m = line.match(/^\s*שם\s*[:：]\s*(.*)$/);
  return m ? clean(m[1]) : null;
}

function matchDescription(line) {
  const m = line.match(/^\s*תיאור\s*[:：]\s*(.*)$/);
  return m ? clean(m[1]) : null;
}

// שורת מספור: "1." / "1)" / "1 ." / "תגית 1"
function isIndexLine(line) {
  return /^\s*(תגית\s*)?\d+\s*[.)\u05be-]?\s*$/.test(line);
}

// שורת כותרת ראשית: "תגית" / "תגיות"
function isHeaderLine(line) {
  return /^\s*תגי(ת|ות)\s*$/.test(line);
}

/**
 * parseMessage(text) -> { tags: [{ name, description }], warnings: [] }
 * זורק ParseError אם אין אף תגית תקינה.
 */
function parseMessage(rawText) {
  const text = clean(rawText);
  if (!text) {
    throw new ParseError("ההודעה ריקה.", "EMPTY_MESSAGE");
  }

  const lines = text.split(/\r?\n/);

  const tags = [];
  const warnings = [];
  let current = null; // { name, description }

  const pushCurrent = () => {
    if (current && (current.name || current.description)) {
      tags.push(current);
    }
    current = null;
  };

  for (let raw of lines) {
    const line = clean(raw);
    if (!line) continue;

    if (isHeaderLine(line)) continue; // מתעלמים מהכותרת "תגיות"

    if (isIndexLine(line)) {
      // התחלת תגית חדשה
      pushCurrent();
      current = { name: "", description: "" };
      continue;
    }

    const name = matchName(line);
    if (name !== null) {
      // אם אין תגית פתוחה (פורמט בלי מספור) — פותחים אחת
      if (!current) current = { name: "", description: "" };
      // אם כבר יש שם לתגית הנוכחית, זו כנראה תגית חדשה בלי מספור
      if (current.name) {
        pushCurrent();
        current = { name: "", description: "" };
      }
      current.name = name;
      continue;
    }

    const desc = matchDescription(line);
    if (desc !== null) {
      if (!current) current = { name: "", description: "" };
      // המשך תיאור רב-שורתי: אם כבר יש תיאור, נצרף
      current.description = current.description
        ? current.description + " " + desc
        : desc;
      continue;
    }

    // שורה חופשית שאינה כותרת — אם יש תגית פתוחה עם תיאור, נצרף כהמשך התיאור
    if (current && current.description) {
      current.description += " " + line;
    } else {
      warnings.push(`שורה לא זוהתה והותעלמה: "${line}"`);
    }
  }
  pushCurrent();

  if (tags.length === 0) {
    throw new ParseError(
      'לא זוהתה אף תגית. ודא שההודעה מכילה שורות "שם:" ו-"תיאור:".',
      "NO_TAGS"
    );
  }

  // ולידציה לכל תגית
  const validated = tags.map((t, i) => {
    const n = i + 1;
    if (!t.name) {
      throw new ParseError(`בתגית מספר ${n} חסר שם (שורת "שם:").`, "MISSING_NAME");
    }
    if (!t.description) {
      throw new ParseError(
        `בתגית מספר ${n} ("${t.name}") חסר תיאור (שורת "תיאור:").`,
        "MISSING_DESCRIPTION"
      );
    }
    return { index: n, name: t.name, description: t.description };
  });

  return { tags: validated, warnings };
}

module.exports = { parseMessage, ParseError, clean };
