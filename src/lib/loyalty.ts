/** M7 باشگاه / جشنواره — client helpers. DEMO mirrors vps/loyalty.py */

import { apiFetch, apiUrl } from "./api";

export const MODULE_LABEL = "باشگاه / جشنواره";
export const PRODUCT_LABEL = MODULE_LABEL;

export const EARN_REASONS = ["early_pay", "new_policy", "referral"] as const;
export type EarnReason = (typeof EARN_REASONS)[number];

export const DEMO_RATES = {
  early_pay_per_day: 10,
  early_pay_flat: 25,
  new_policy: 100,
  referral: 50,
} as const;

export const LOCKED_TRIGGER_TYPES = ["universal_life", "omid_retirement"] as const;
export const LOCKED_COUPON_TARGET = "fire" as const;

export const COUPON_RULES = [
  {
    id: "rule-ul-omid-fire20",
    triggerPolicyTypes: [...LOCKED_TRIGGER_TYPES],
    couponInsuranceType: LOCKED_COUPON_TARGET,
    discountPercent: 20,
    label: "۲۰٪ تخفیف آتش‌سوزی منازل (خرید عمر اندوخته‌دار / امید)",
    codePrefix: "FIRE20",
  },
] as const;

export const DEFAULT_SEASON = "1404-autumn";

export const DEMO_DISCLAIMER =
  "DEMO — اسکلت باشگاه/جشنواره؛ امتیاز قسط زودتر، خرید جدید، referral؛ کوپن متقاطع stub؛ لیدربورد فصلی نمایندگان. Excel HOLD · بدون wipe CRM · Eng-only این بچ.";

/** Karafarin public shop — client deep-link only (no CRM login). */
export const SHOP_URL = "https://shop.karafarin-insurance.ir/";
export const SHOP_LABEL = "فروشگاه کارآفرین";
export const SHOP_OPEN_LABEL = "باز کردن فروشگاه";
/**
 * Probed 2026-09-24 Asia/Tehran:
 * - X-Frame-Options: SAMEORIGIN → cross-origin iframe blocked
 * - CoS FACT: shop WAF-blocks CRM server IP (Attack ID 20000051) → no server scrape/proxy
 * UI must open via deep-link (target=_blank / same tab) only.
 */
export const SHOP_IFRAME_ALLOWED = false;
export const SHOP_IFRAME_BLOCK_REASON =
  "X-Frame-Options: SAMEORIGIN — جاسازی iframe مسدود است؛ از «باز کردن فروشگاه» استفاده کنید.";
export const SHOP_OPEN_HINT =
  "بدون ورود CRM · لینک مستقیم به فروشگاه عمومی · بدون پروکسی سرور (WAF).";

export type LedgerEntry = {
  id: number;
  policyholderCode: string;
  reason: EarnReason | string;
  points: number;
  meta?: Record<string, unknown>;
  createdAt?: string;
  demoStub?: boolean;
};

export type Coupon = {
  id: number;
  code: string;
  policyholderCode: string;
  triggerPolicyType: string;
  couponInsuranceType: string;
  discountPercent: number;
  label?: string;
  status?: string;
  demoStub?: boolean;
};

export type AgentScore = {
  id: number;
  agentCode: string;
  agentName?: string;
  agencyCode?: string;
  season: string;
  points: number;
  rank?: number;
  demoStub?: boolean;
};

const JALALI_RE = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;

export function parseJalali(s: string | null | undefined): [number, number, number] | null {
  if (!s) return null;
  const m = String(s).trim().match(JALALI_RE);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  return [y, mo, d];
}

export function jalaliDayOrdinal(parts: [number, number, number]): number {
  const [y, mo, d] = parts;
  return y * 365 + mo * 30 + d;
}

export function daysEarly(
  paidJalali: string | null | undefined,
  dueJalali: string | null | undefined,
): number | null {
  const p = parseJalali(paidJalali);
  const d = parseJalali(dueJalali);
  if (!p || !d) return null;
  return jalaliDayOrdinal(d) - jalaliDayOrdinal(p);
}

/** Client-side DEMO early-pay points (mirrors Python). */
export function earlyPayPoints(
  paidDateJalali: string | null | undefined,
  dueDateJalali: string | null | undefined,
  rates: { early_pay_per_day?: number; early_pay_flat?: number } = DEMO_RATES,
): { eligible: boolean; daysEarly: number | null; points: number } {
  const delta = daysEarly(paidDateJalali, dueDateJalali);
  if (delta === null) return { eligible: false, daysEarly: null, points: 0 };
  if (delta <= 0) return { eligible: false, daysEarly: delta, points: 0 };
  const perDay = rates.early_pay_per_day ?? 10;
  const flatMin = rates.early_pay_flat ?? 25;
  return { eligible: true, daysEarly: delta, points: Math.max(flatMin, delta * perDay) };
}

/** Sort leaderboard by points desc, then agentCode asc; assign rank 1..n */
export function sortLeaderboard<T extends { points: number; agentCode: string }>(
  rows: T[],
): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => {
    const dp = (b.points || 0) - (a.points || 0);
    if (dp !== 0) return dp;
    return String(a.agentCode).localeCompare(String(b.agentCode));
  });
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function findCouponRule(triggerPolicyType: string) {
  const t = String(triggerPolicyType || "").trim();
  return COUPON_RULES.find((r) => (r.triggerPolicyTypes as readonly string[]).includes(t)) || null;
}

export function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    early_pay: "پرداخت زودتر از موعد",
    new_policy: "خرید بیمه‌نامه جدید",
    referral: "معرفی سرنخ",
  };
  return map[reason] || reason;
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  return (await res.json()) as T;
}

export function fetchLoyaltyMeta() {
  return jsonFetch<{
    ok: boolean;
    counts?: Record<string, number>;
    rates?: Record<string, number>;
    disclaimer?: string;
  }>("/api/loyalty/meta");
}

export function fetchBalance(policyholderCode: string) {
  const qs = new URLSearchParams({ policyholderCode });
  return jsonFetch<{
    ok: boolean;
    balance?: number;
    entries?: number;
    error?: string;
  }>(`/api/loyalty/balance?${qs.toString()}`);
}

export function fetchLedger(policyholderCode: string) {
  const qs = new URLSearchParams({ policyholderCode });
  return jsonFetch<{
    ok: boolean;
    items?: LedgerEntry[];
    count?: number;
    error?: string;
  }>(`/api/loyalty/ledger?${qs.toString()}`);
}

export function postEarn(body: {
  reason: EarnReason;
  policyholderCode: string;
  paidDateJalali?: string;
  dueDateJalali?: string;
  installmentNo?: number;
  policyType?: string;
  leadRef?: string;
  policyNumber?: string;
  nationalId?: string;
}) {
  return jsonFetch<{
    ok: boolean;
    points?: number;
    balance?: number;
    entry?: LedgerEntry;
    error?: string;
  }>("/api/loyalty/earn", { method: "POST", body: JSON.stringify(body) });
}

export function issueCoupon(body: {
  triggerPolicyType: string;
  policyholderCode: string;
  policyNumber?: string;
  nationalId?: string;
}) {
  return jsonFetch<{
    ok: boolean;
    issued?: boolean;
    coupon?: Coupon;
    error?: string;
  }>("/api/loyalty/coupons/issue", { method: "POST", body: JSON.stringify(body) });
}

export function fetchCoupons(policyholderCode: string) {
  const qs = new URLSearchParams({ policyholderCode });
  return jsonFetch<{
    ok: boolean;
    items?: Coupon[];
    count?: number;
    error?: string;
  }>(`/api/loyalty/coupons?${qs.toString()}`);
}

export function fetchFestival(season?: string) {
  const qs = new URLSearchParams();
  if (season) qs.set("season", season);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return jsonFetch<{
    ok: boolean;
    season?: string;
    campaigns?: Array<Record<string, unknown>>;
    leaderboard?: AgentScore[];
    topPoints?: number;
    agentCount?: number;
    error?: string;
  }>(`/api/loyalty/festival${suffix}`);
}

export function postFestivalScore(body: {
  agentCode: string;
  points: number;
  season?: string;
  agentName?: string;
  agencyCode?: string;
}) {
  return jsonFetch<{
    ok: boolean;
    score?: AgentScore;
    rank?: number;
    created?: boolean;
    error?: string;
  }>("/api/loyalty/festival/score", { method: "POST", body: JSON.stringify(body) });
}
