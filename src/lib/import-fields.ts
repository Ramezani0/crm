/** Persian labels for 18-file Excel / Postgres columns shown in پرونده ۳۶۵. */

export const IMPORT_FIELD_LABEL: Record<string, string> = {
  computerCode: "کد رایانه",
  holderCode: "کد بیمه‌گذار",
  holderName: "نام بیمه‌گذار",
  holderNationalId: "کد ملی بیمه‌گذار",
  kindRaw: "رشتهٔ خام",
  statusLabel: "برچسب وضعیت",
  issueDate: "تاریخ صدور",
  paymentMethod: "روش پرداخت",
  paidDate: "تاریخ پرداخت",
  paidAmount: "مبلغ پرداخت‌شده",
  payerNationalId: "کد ملی پرداخت‌کننده",
  insuredNationalId: "کد ملی بیمه‌شده",
  address: "نشانی",
  fatherName: "نام پدر",
  birthDate: "تاریخ تولد",
  postalCode: "کد پستی",
  sourceSystem: "سامانه مبدأ",
  sourceFile: "فایل مبدأ",
  mobile: "موبایل",
  capital: "سرمایه",
  coverage: "پوشش",
  seq: "ردیف",
  premium: "حق‌بیمه",
  initialPremium: "آخرین الحاقیه",
  initialPremiumStart: "حق بیمه اولیه (شروع)",
  initial_premium: "آخرین الحاقیه",
  initial_premium_start: "حق بیمه اولیه (شروع)",
  premiumAdjPct: "درصد ضریب تعدیل",
};

export function importFieldLabel(key: string): string {
  if (IMPORT_FIELD_LABEL[key]) return IMPORT_FIELD_LABEL[key];
  const spaced = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
  return spaced || key;
}

export function extrasEntries(extras?: Record<string, string> | null): Array<[string, string]> {
  if (!extras) return [];
  return Object.entries(extras).filter(([, value]) => (value ?? "").trim() !== "");
}
