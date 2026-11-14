const PERSIAN_DIGITS: Record<string, string> = {
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

const MOBILE_RE = /^09\d{9}$/;

export function normalizeMobile(raw?: string | null): string {
  const translated = (raw ?? "").replace(/[۰-۹٠-٩]/g, (d) => PERSIAN_DIGITS[d] ?? d);
  let digits = translated.replace(/\D/g, "");
  if (digits.startsWith("98") && digits.length === 12) digits = `0${digits.slice(2)}`;
  if (digits.startsWith("9") && digits.length === 10) digits = `0${digits}`;
  return MOBILE_RE.test(digits) ? digits : "";
}
