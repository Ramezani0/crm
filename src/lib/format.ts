const faDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export const toFa = (v: string | number) => String(v).replace(/\d/g, (d) => faDigits[Number(d)]);

export const formatNumber = (n: number) => toFa(new Intl.NumberFormat("en-US").format(Math.round(n)));

export const formatRial = (n: number) => `${formatNumber(n)} ریال`;

export const formatToman = (n: number) => `${formatNumber(Math.round(n / 10))} تومان`;

const jalali = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});

export const formatDate = (isoDate: string) => jalali.format(new Date(isoDate));

export function relativeDays(isoDate: string, from: Date) {
  return Math.round((new Date(isoDate).getTime() - from.getTime()) / 86400000);
}

export function compactRial(n: number) {
  if (n >= 1_000_000_000) return `${toFa((n / 1_000_000_000).toFixed(1))} میلیارد`;
  if (n >= 1_000_000) return `${toFa(Math.round(n / 1_000_000))} میلیون`;
  return formatNumber(n);
}
