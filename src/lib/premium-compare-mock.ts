/** Mock insurer quotes for premium compare skeleton. Live BimeBazar comes later. */

export type PremiumLine = "third_party" | "body";

/** راهور plate letters — بدون «و» و «ه» per product lock. */
export const PLATE_LETTERS = [
  "الف",
  "ب",
  "پ",
  "ت",
  "ث",
  "ج",
  "د",
  "ز",
  "س",
  "ش",
  "ص",
  "ط",
  "ع",
  "ف",
  "ق",
  "ک",
  "گ",
  "ل",
  "م",
  "ن",
  "ی",
] as const;

export type PlateLetter = (typeof PLATE_LETTERS)[number];

export type IranianPlate = {
  /** ۲ رقم سمت راست پلاک */
  platePart1: string;
  plateLetter: PlateLetter | "";
  /** ۳ رقم میانی */
  platePart2: string;
  /** کد ایران (۲ رقم) */
  plateIranCode: string;
};

/** پله‌های پوشش مالی ثالث — تومان */
export const FINANCIAL_COVER_TOMAN = [
  70_000_000, 100_000_000, 150_000_000, 200_000_000, 250_000_000, 300_000_000,
  350_000_000, 400_000_000, 450_000_000, 500_000_000, 600_000_000, 700_000_000,
  800_000_000, 900_000_000, 1_000_000_000,
] as const;

export type VehicleInputs = {
  plate: IranianPlate;
  /** کد ملی ۱۰ رقم — validated with checksum when complete */
  nationalId: string;
  /** پوشش مالی ثالث (تومان) — required for third_party; UI asks, no silent default on submit */
  financialCover: number | null;
  year: string;
  usage: string;
  vehicleType: string;
  capacity: string;
  noClaimYears: string;
  city: string;
};

/** Hub categories (P0 SPEC). API line for car_body remains `body`. */
export type BimeBazarCategory = "third_party" | "car_body" | "other_discover";

export const BIMEBAZAR_CATEGORY_LABELS: Record<BimeBazarCategory, string> = {
  third_party: "ثالث خودرو",
  car_body: "بدنه",
  other_discover: "سایر محصولات",
};

/** Honest partners chip — never «API رسمی بیمه‌بازار» / never «سنهاب رسمی». */
export const BIMEBAZAR_SOURCE_CHIP_FA = "از طریق پنل شرکای بیمه‌بازار";

export const OTHER_DISCOVER_STUB_FA = "به‌زودی — منتظر map وصل‌کن";

/** Map hub category → premium-compare API `line` (body, not car_body). */
export function categoryToPremiumLine(cat: BimeBazarCategory): PremiumLine | null {
  if (cat === "third_party") return "third_party";
  if (cat === "car_body") return "body";
  return null;
}

export type InsurerCompareRow = {
  id: string;
  name: string;
  /** حق بیمه ثالث (ریال) — null اگر فقط بدنه */
  thirdParty: number | null;
  /** حق بیمه بدنه (ریال) — null اگر فقط ثالث */
  body: number | null;
  /** تعرفه نهایی شرکا (ریال) — وقتی از partners آمده */
  tariff?: number | null;
  /** تعرفه پایه شرکا (ریال) */
  baseTariff?: number | null;
  /** تخفیف‌ها — dict/list/string/number از partners */
  discounts?: unknown;
  /** سطح توانگری — اگر partners برگرداند */
  solvencyLevel?: unknown;
};

/** Humanize discounts for table cell (no truncate of company list — only cell text). */
export function formatOfferDiscounts(raw: unknown): string {
  if (raw == null || raw === "") return "—";
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "string") return raw.trim() || "—";
  if (Array.isArray(raw)) {
    const parts = raw
      .map((x) => formatOfferDiscounts(x))
      .filter((s) => s && s !== "—");
    return parts.length ? parts.join(" · ") : "—";
  }
  if (typeof raw === "object") {
    const parts = Object.entries(raw as Record<string, unknown>).map(([k, v]) => {
      if (v == null || v === "") return k;
      if (typeof v === "number" || typeof v === "string") return `${k}: ${v}`;
      return `${k}: ${JSON.stringify(v)}`;
    });
    return parts.length ? parts.join(" · ") : "—";
  }
  return String(raw);
}

export function formatSolvencyLevel(raw: unknown): string {
  if (raw == null || raw === "") return "—";
  return String(raw);
}

export const EMPTY_PLATE: IranianPlate = {
  platePart1: "",
  plateLetter: "",
  platePart2: "",
  plateIranCode: "",
};

export const DEFAULT_VEHICLE_INPUTS: VehicleInputs = {
  plate: { ...EMPTY_PLATE },
  nationalId: "",
  financialCover: null,
  year: "",
  usage: "",
  vehicleType: "",
  capacity: "",
  noClaimYears: "",
  city: "",
};

export const USAGE_OPTIONS = ["شخصی", "تاکسی", "آژانس", "سایر"] as const;
export const VEHICLE_TYPE_OPTIONS = ["سواری", "وانت", "موتورسیکلت", "اتوبوس"] as const;

/** Fields the mock/live API may still need — UI must ask, never silent-default. */
export type MissingFieldKey =
  | "plate"
  | "nationalId"
  | "financialCover"
  | "year"
  | "usage"
  | "vehicleType"
  | "capacity"
  | "noClaimYears"
  | "city";

export const MISSING_FIELD_LABELS: Record<MissingFieldKey, string> = {
  plate: "پلاک خودرو (۱۲ | ب | ۳۴۵ | ایران ۱۱)",
  nationalId: "کد ملی (۱۰ رقم)",
  financialCover: "پوشش مالی ثالث",
  year: "سال ساخت (شمسی)",
  usage: "کاربری",
  vehicleType: "نوع وسیله",
  capacity: "ظرفیت / سیلندر",
  noClaimYears: "سابقه عدم خسارت",
  city: "شهر / منطقه",
};

/** Iranian national ID checksum (کد ملی). */
export function isValidNationalId(raw: string): boolean {
  const id = raw.replace(/\D/g, "");
  if (!/^\d{10}$/.test(id)) return false;
  if (/^(\d)\1{9}$/.test(id)) return false;
  const check = Number(id[9]);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(id[i]) * (10 - i);
  const rem = sum % 11;
  return rem < 2 ? check === rem : check === 11 - rem;
}

export function isCompletePlate(plate: IranianPlate): boolean {
  return (
    /^\d{2}$/.test(plate.platePart1) &&
    (PLATE_LETTERS as readonly string[]).includes(plate.plateLetter) &&
    /^\d{3}$/.test(plate.platePart2) &&
    /^\d{2}$/.test(plate.plateIranCode)
  );
}

export function formatPlate(plate: IranianPlate): string {
  if (!isCompletePlate(plate)) return "";
  return `${plate.platePart1} | ${plate.plateLetter} | ${plate.platePart2} | ایران ${plate.plateIranCode}`;
}

/** Collect missing required fields for a line — UI prompts these explicitly. */
export function collectMissingFields(line: PremiumLine, values: VehicleInputs): MissingFieldKey[] {
  const missing: MissingFieldKey[] = [];
  if (!isCompletePlate(values.plate)) missing.push("plate");
  if (!isValidNationalId(values.nationalId)) missing.push("nationalId");
  if (line === "third_party" && (values.financialCover == null || values.financialCover <= 0)) {
    missing.push("financialCover");
  }
  if (!values.year.trim()) missing.push("year");
  if (!values.usage.trim()) missing.push("usage");
  if (!values.vehicleType.trim()) missing.push("vehicleType");
  return missing;
}

/**
 * ~20+ insurers — never truncate to 3–5 in the UI.
 * Prices are mock ریال; scale slightly by financial cover when provided.
 */
const INSURER_NAMES = [
  "بیمه کارآفرین",
  "بیمه ایران",
  "بیمه آسیا",
  "بیمه البرز",
  "بیمه دانا",
  "بیمه پارسیان",
  "بیمه معلم",
  "بیمه کوثر",
  "بیمه پاسارگاد",
  "بیمه سامان",
  "بیمه رازی",
  "بیمه ملت",
  "بیمه نوین",
  "بیمه سینا",
  "بیمه دی",
  "بیمه ما",
  "بیمه کارآفرین تعاون",
  "بیمه تجارت‌نو",
  "بیمه آرمان",
  "بیمه میهن",
  "بیمه حافظ",
  "بیمه امید",
] as const;

function mockPair(seed: number, coverToman: number | null): { third: number; body: number } {
  const coverFactor = coverToman ? 0.85 + (coverToman / 1_000_000_000) * 0.35 : 1;
  const third = Math.round((38_000_000 + seed * 1_150_000) * coverFactor);
  const body = Math.round(72_000_000 + seed * 2_050_000);
  return { third, body };
}

export function buildMockCompareRows(coverToman: number | null): InsurerCompareRow[] {
  return INSURER_NAMES.map((name, i) => {
    const { third, body } = mockPair(i, coverToman);
    return {
      id: `ins-${i}`,
      name,
      thirdParty: third,
      body,
      tariff: third,
      baseTariff: Math.round(third * 0.92),
      discounts: null,
      solvencyLevel: null,
    };
  });
}

function rowSortKey(row: InsurerCompareRow): number {
  if (row.tariff != null && Number.isFinite(row.tariff)) return row.tariff;
  return (row.thirdParty ?? 0) + (row.body ?? 0);
}

export function sortByTotal(rows: InsurerCompareRow[]): InsurerCompareRow[] {
  return [...rows].sort((a, b) => rowSortKey(a) - rowSortKey(b));
}

/**
 * Browser source preference.
 * - "mock"  = explicit demo only (CoS emergency) — never silent primary when live configured
 * - "live"  = force live partners path
 * - "auto"  = default: live when /status.configured, else clear not-configured UX (no fake prices)
 */
export function premiumCompareSource(): "mock" | "live" | "auto" {
  const flag = String(import.meta.env.VITE_PREMIUM_COMPARE_SOURCE ?? "auto").toLowerCase();
  if (flag === "mock") return "mock";
  if (flag === "live") return "live";
  return "auto";
}

/** Env names for DevOps / UX (never values). */
export const BIMEBAZAR_ENV_NAMES = [
  "BIMEBAZAR_URL",
  "BIMEBAZAR_USER",
  "BIMEBAZAR_PASS",
] as const;

export const BIMEBAZAR_OPTIONAL_ENV_NAMES = [
  "BIMEBAZAR_LOGIN_BASE",
  "BIMEBAZAR_API_BASE",
] as const;

export const MOCK_INSURER_COUNT = INSURER_NAMES.length;
