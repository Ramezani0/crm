/** Display helpers for CRM tables — empty values become "—", IDs stay as stored (no zero-padding). */

const FA_TO_EN: Record<string, string> = {
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

/** Normalize Persian/Arabic digits to ASCII (for login password etc.). */
export function toAsciiDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (d) => FA_TO_EN[d] ?? d);
}

/** Empty / whitespace-only → "—". Never invent leading zeros. */
export function displayText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const s = String(value).trim();
  return s.length ? s : "—";
}

const JALALI_RE = /^\d{3,4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/;

/** Show Jalali strings as-is; ISO dates via formatDate; empty → "—". */
export function displayDate(value: string | null | undefined, formatIso: (iso: string) => string): string {
  if (!value || !String(value).trim()) return "—";
  const s = String(value).trim();
  if (JALALI_RE.test(s)) return s.replace(/-/g, "/");
  const t = Date.parse(s);
  if (Number.isNaN(t)) return s;
  return formatIso(s);
}
