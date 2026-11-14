/**
 * Premium adjustment (تعدیل حق‌بیمه) — locked CRM formula.
 * P_n = P_0 * (1+r)^(n-1)  // P in Rial, n from 1
 *
 * Each year is a 12-month Jalali insurance year.
 * jalaliYear = startYear + n - 1 (default startYear = 1405).
 *
 * Retirement (بازنشستگی): r = 0.10 fixed
 * Life (عمر): r ∈ LIFE_RATES from policy/Excel when present
 */

export const RETIREMENT_RATE = 0.1 as const;

/** Life / عمر options — Excel / agency set (includes 5% and 30%). */
export const LIFE_RATES = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3] as const;

export type LifeRate = (typeof LIFE_RATES)[number];

export type PremiumProduct = "life" | "retirement";

export type PremiumYearRow = {
  /** Policy year index 1..n (compat) */
  year: number;
  /** Jalali calendar year for this 12-month insurance year */
  jalaliYear: number;
  premiumRial: number;
  premiumToman: number;
};

/**
 * دیه ۱۴۰۵ — VERIFIED قوه قضاییه (locked for this CRM calc).
 * Amounts in Rial; Toman = Rial / 10. Not a user claim.
 */
export const DIYA_DEFAULT_YEAR = 1405 as const;

export const DIYA_1405_VERIFIED = {
  status: "VERIFIED" as const,
  year: DIYA_DEFAULT_YEAR,
  sourceLabel: "قوه قضاییه",
  source: "بخشنامه دیه ۱۴۰۵ قوه قضاییه",
  /** ریال */
  ordinaryRial: 21_000_000_000,
  /** ریال — ماه حرام */
  haramRial: 28_000_000_000,
  /** تومان */
  ordinaryToman: 2_100_000_000,
  /** تومان — ماه حرام */
  haramToman: 2_800_000_000,
  /**
   * حداقل تعهد مالی شخص ثالث ≈ ۲٫۵٪ تعهد بدنی (دیه حرام).
   * 0.025 × 28e9 = 700e6 ریال.
   */
  thirdPartyPropertyMinRial: 700_000_000,
  thirdPartyPropertyMinToman: 70_000_000,
} as const;

export function isLifeRate(r: number): r is LifeRate {
  return (LIFE_RATES as readonly number[]).includes(r);
}

export function rateForProduct(product: PremiumProduct, r?: number): number {
  if (product === "retirement") return RETIREMENT_RATE;
  if (r !== undefined && Number.isFinite(r) && isLifeRate(r)) return r;
  return RETIREMENT_RATE;
}

/** Single-year premium in Rial. n must be >= 1. */
export function premiumAtYear(p0: number, r: number, n: number): number {
  if (!Number.isFinite(p0) || p0 < 0) return 0;
  if (!Number.isFinite(r) || r < 0) return 0;
  if (!Number.isFinite(n) || n < 1) return 0;
  const year = Math.floor(n);
  const value = p0 * (1 + r) ** (year - 1);
  return Math.round(value);
}

export function rialToToman(rial: number): number {
  return Math.round(rial / 10);
}

/**
 * Year-by-year schedule for n = 1..years.
 * Each year is a 12-month Jalali insurance year.
 * @param years positive integer count of insurance years
 * @param startYear Jalali calendar year for n=1 (default 1405)
 */
export function premiumSchedule(
  p0: number,
  r: number,
  years: number,
  startYear: number = DIYA_DEFAULT_YEAR,
): PremiumYearRow[] {
  const count = Math.floor(years);
  if (!Number.isFinite(count) || count < 1) return [];
  const max = Math.min(count, 100);
  const start = Number.isFinite(startYear) ? Math.floor(startYear) : DIYA_DEFAULT_YEAR;
  const rows: PremiumYearRow[] = [];
  for (let n = 1; n <= max; n += 1) {
    const premiumRial = premiumAtYear(p0, r, n);
    rows.push({
      year: n,
      jalaliYear: start + n - 1,
      premiumRial,
      premiumToman: rialToToman(premiumRial),
    });
  }
  return rows;
}

export function totalPremiums(p0: number, r: number, years: number, startYear?: number): number {
  return premiumSchedule(p0, r, years, startYear).reduce((sum, row) => sum + row.premiumRial, 0);
}

export function formatRatePercent(r: number): string {
  return `${Math.round(r * 100)}٪`;
}

/** English + Persian kinds for UL / امید بازنشستگی ladder. */
export function isPremiumLadderKind(kind?: string | null): boolean {
  const k = (kind ?? "").trim();
  if (!k) return false;
  if (/universal[_-]?life|omid[_-]?retirement/i.test(k)) return true;
  if (/عمر\s*و\s*سرمایه|امید\s*بازنشست|بازنشست|مستمری/i.test(k)) return true;
  return false;
}

/** Detect retirement vs life from policy kind string (best-effort). */
export function inferProductFromKind(kind?: string | null): PremiumProduct {
  const k = (kind ?? "").trim();
  if (/omid[_-]?retirement/i.test(k)) return "retirement";
  if (/بازنشست|مستمری|امید\s*بازنشست/i.test(k)) return "retirement";
  return "life";
}

/** Parse leading Jalali year from start_date TEXT (yyyy/mm/dd or yyyy-…). */
export function parseJalaliYear(startDate?: string | null): number | null {
  const s = String(startDate ?? "").trim();
  const m = s.match(/^(\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  if (!Number.isFinite(y) || y < 1300 || y > 1600) return null;
  return y;
}

/** years = targetYear − startYear + 1, clamped to 1..100. */
export function yearsThroughTarget(
  startYear: number,
  targetYear: number = DIYA_DEFAULT_YEAR,
): number {
  if (!Number.isFinite(startYear) || !Number.isFinite(targetYear)) return 1;
  const years = Math.floor(targetYear) - Math.floor(startYear) + 1;
  return Math.max(1, Math.min(100, years));
}

/**
 * r from Excel adj %: life uses adj/100 when in LIFE_RATES;
 * retirement always 0.10 (empty adj → 0.10).
 */
export function rateFromAdjPct(
  product: PremiumProduct,
  adjPct?: number | null,
): number {
  if (product === "retirement") return RETIREMENT_RATE;
  if (adjPct == null || !Number.isFinite(adjPct)) return RETIREMENT_RATE;
  // Stored as percent (10) or already fraction (0.10)
  let r = adjPct;
  if (adjPct > 1) r = adjPct / 100;
  if (isLifeRate(r)) return r;
  return RETIREMENT_RATE;
}

const ENDORSEMENT_KEY_RE =
  /الحاقی|افزایش\s*حق|نوع\s*تغيير|نوع\s*تغییر|شماره\s*الحاقي|endorsement|amendment|premium.?increase/i;

/**
 * Surface clear increase-endorsement keys from extras/case_365 — no invented amounts.
 * Returns null when nothing clear is present (stub-friendly).
 */
export function endorsementIncreaseNote(
  extras?: Record<string, string> | null,
): string | null {
  if (!extras || typeof extras !== "object") return null;
  const hits: string[] = [];
  for (const [key, value] of Object.entries(extras)) {
    if (!ENDORSEMENT_KEY_RE.test(key)) continue;
    const v = String(value ?? "").trim();
    hits.push(v ? `${key}=${v}` : key);
  }
  if (hits.length === 0) return null;
  return `الحاقیه/تغییر حق‌بیمه در extras (مبلغ اختراع نشده): ${hits.slice(0, 8).join(" · ")}`;
}

/** Positive Rial from top-level or extras (camel / snake). */
export function pickPositiveRial(
  top?: number | null,
  extras?: Record<string, string> | null,
  ...extraKeys: string[]
): number | undefined {
  if (top != null && Number.isFinite(top) && top > 0) return Math.round(top);
  if (!extras) return undefined;
  for (const key of extraKeys) {
    const raw = extras[key];
    if (raw == null || String(raw).trim() === "") continue;
    const n = Number(String(raw).replace(/,/g, "").trim());
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return undefined;
}

export type LadderP0Source = "start" | "none";

export type LadderP0Resolution = {
  /** Start-of-policy P0 for auto-ladder; null when start field missing */
  p0: number | null;
  source: LadderP0Source;
  /** Do not auto-ladder from latest endorsement */
  warning: string | null;
  /** policies.initial_premium — latest endorsement (display only) */
  latestPremium: number | null;
};

/**
 * Ladder P0 LOCK: seed only from initialPremiumStart (Excel start-year IP).
 * Never silently ladder from initialPremium (latest endorsement).
 */
export function resolveLadderP0(policy?: {
  initialPremiumStart?: number | null;
  initialPremium?: number | null;
  extras?: Record<string, string> | null;
} | null): LadderP0Resolution {
  const extras = policy?.extras ?? null;
  const latest =
    pickPositiveRial(policy?.initialPremium, extras, "initialPremium", "initial_premium") ??
    null;
  const start =
    pickPositiveRial(
      policy?.initialPremiumStart,
      extras,
      "initialPremiumStart",
      "initial_premium_start",
    ) ?? null;
  if (start != null && start > 0) {
    return { p0: start, source: "start", warning: null, latestPremium: latest };
  }
  return {
    p0: null,
    source: "none",
    warning:
      "حق بیمه اولیه شروع موجود نیست — نردبان خودکار از آخرین الحاقیه اجرا نمی‌شود. P₀ را دستی وارد کنید.",
    latestPremium: latest,
  };
}

