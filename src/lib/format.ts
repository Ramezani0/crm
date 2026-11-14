const faDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const FA_DIGIT_RE = /[۰-۹]/g;
const AR_DIGIT_RE = /[٠-٩]/g;
const FA_DIGIT_STR = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGIT_STR = "٠١٢٣٤٥٦٧٨٩";

export const toFa = (v: string | number) => String(v).replace(/\d/g, (d) => faDigits[Number(d)]);

/** Persian / Arabic-Indic digits → ASCII, so live `۱۴۰۴/۰۴/۱۹` parses. */
export function toEnDigits(value: string): string {
  return String(value)
    .replace(FA_DIGIT_RE, (d) => String(FA_DIGIT_STR.indexOf(d)))
    .replace(AR_DIGIT_RE, (d) => String(AR_DIGIT_STR.indexOf(d)));
}

export const formatNumber = (n: number) =>
  toFa(new Intl.NumberFormat("en-US").format(Math.round(n)));

export const formatRial = (n: number) => `${formatNumber(n)} ریال`;

export const formatToman = (n: number) => `${formatNumber(Math.round(n / 10))} تومان`;

const jalali = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});

type Ymd = { y: number; m: number; d: number };

/**
 * Live `/api/data` stores policy/installment dates as Jalali text (`1404/04/19`).
 * Years 1200–1500 are Jalali (13xx/14xx). Do not run those through `new Date()` +
 * Persian Intl — Gregorian year 1404 formats as a 3-digit Jalali year (~782).
 */
export function isJalaliYear(year: number): boolean {
  return year >= 1200 && year <= 1500;
}

export function isGregorianYear(year: number): boolean {
  return year >= 1600 && year <= 2200;
}

const YMD_RE = /^(\d{4})[/.\\-](\d{1,2})[/.\\-](\d{1,2})(?:[T\s].*)?$/;

export function parseYmd(raw: string): Ymd | null {
  const text = toEnDigits(raw).trim();
  if (!text) return null;
  const match = text.match(YMD_RE);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/** Return the Jalali year/month for a stored date, whether it is Jalali or Gregorian. */
export function parseJalaliYearMonth(
  raw: string | null | undefined,
): { year: number; month: number } | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const ymd = parseYmd(text);
  if (ymd && isJalaliYear(ymd.y)) return { year: ymd.y, month: ymd.m };
  const date = parseDate(text);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    year: "numeric",
    month: "numeric",
    timeZone: "UTC",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return Number.isFinite(year) && Number.isFinite(month) ? { year, month } : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatJalaliYmd(y: number, m: number, d: number): string {
  return toFa(`${y}/${pad2(m)}/${pad2(d)}`);
}

/**
 * Jalaali → Gregorian. Accurate for modern CRM years (13xx–14xx).
 * Same 33-year cycle as the common jalaali-js / jdf conversion.
 */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  const jy0 = jy + 1595;
  let days =
    -355668 +
    365 * jy0 +
    Math.floor(jy0 / 33) * 8 +
    Math.floor(((jy0 % 33) + 3) / 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const months = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  while (gm <= 12 && gd > months[gm]) {
    gd -= months[gm];
    gm += 1;
  }
  return [gy, gm, gd];
}

function utcDate(y: number, m: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Parse Gregorian ISO *or* live Jalali `YYYY/MM/DD` / `YYYY-MM-DD` (4-digit year). */
export function parseDate(isoDate: string): Date | null {
  if (!isoDate) return null;
  const text = toEnDigits(isoDate).trim();
  if (!text) return null;
  const ymd = parseYmd(text);
  if (ymd) {
    if (isJalaliYear(ymd.y)) {
      const [gy, gm, gd] = jalaliToGregorian(ymd.y, ymd.m, ymd.d);
      return utcDate(gy, gm, gd);
    }
    if (isGregorianYear(ymd.y)) return utcDate(ymd.y, ymd.m, ymd.d);
    return null;
  }
  // 3-digit years like ۷۸۲/۰۷/۰۸ must not go through `new Date()` + Persian Intl.
  if (/^\d{1,3}[/.\\-]\d{1,2}[/.\\-]\d{1,2}/.test(text)) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const formatDate = (isoDate: string) => {
  if (!isoDate) return "—";
  const text = toEnDigits(isoDate).trim();
  if (!text) return "—";
  const ymd = parseYmd(text);
  if (ymd && isJalaliYear(ymd.y)) {
    return formatJalaliYmd(ymd.y, ymd.m, ymd.d);
  }
  const d = parseDate(isoDate);
  return d ? jalali.format(d) : "—";
};

export function relativeDays(isoDate: string, from: Date) {
  const d = parseDate(isoDate);
  if (!d) return Number.NaN;
  const startOfDate = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const startOfFrom = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.round((startOfDate - startOfFrom) / 86400000);
}

/** Active-policy 0–maxDays window used by `/renewals` (and dossier near-bucket). */
export function isInRenewalWindow(endDate: string, from: Date, maxDays = 45): boolean {
  const days = relativeDays(endDate, from);
  return Number.isFinite(days) && days >= 0 && days <= maxDays;
}

export function compareDateStrings(a: string, b: string): number {
  const da = parseDate(a)?.getTime() ?? Number.POSITIVE_INFINITY;
  const db = parseDate(b)?.getTime() ?? Number.POSITIVE_INFINITY;
  return da - db;
}

export const emptyDash = (value: string | undefined | null) => {
  const s = (value ?? "").trim();
  return s ? s : "—";
};

/** کد بیمه‌گذار — never invent nationalId or agency 3045. */
export function displayHolderCode(value: string | undefined | null): string {
  const s = (value ?? "").trim();
  return s ? toFa(s) : "—";
}

/** Persian UI label for customers.legal_entity_id — never use an English label. */
export const LEGAL_ENTITY_ID_LABEL = "شناسه حقوقی";

/** Display value: keep identifier text (leading zeros). Empty/null → —. */
export function displayLegalEntityId(value: string | undefined | null): string {
  const s = (value ?? "").trim();
  return s ? s : "—";
}

export function compactRial(n: number) {
  if (n >= 1_000_000_000) return `${toFa((n / 1_000_000_000).toFixed(1))} میلیارد`;
  if (n >= 1_000_000) return `${toFa(Math.round(n / 1_000_000))} میلیون`;
  return formatNumber(n);
}
