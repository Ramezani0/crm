/** M3 امید بازنشستگی — client helpers. DEMO mirrors vps/omid_pension.py */

import { apiFetch, apiUrl } from "./api";

export const PRODUCT_LABEL = "امید بازنشستگی";
export const INSURANCE_TYPE = "omid_retirement";
export const COMPOUND_RATE = 0.1;
export const RETIREMENT_AGE_MIN = 50;
export const RETIREMENT_AGE_MAX = 61;
export const GUARANTEED_YEARS = 10;
export const DEMO_ANNUITY_YEARS = 20;
export const DEFAULT_ACCUMULATION_RIAL = 240_000_000;
export const DEMO_DISCLAIMER =
  "DEMO — فرمول نمونه اسکلت؛ اکچوئری رسمی پس از WIPE_GO/اکسل. MonthlyPension_yearN = MonthlyPension_0 * (1.10)^N";

/** Public Teamsho simulator (Karafarin). Not a secret. No API/iframe — open in new tab. */
export const DEFAULT_TEAMSHO_URL = "https://teamsho.karafarin-insurance.ir/";

/**
 * Browser override: VITE_OMID_TEAMSHO_URL (Vite client env).
 * Docs alias OMID_TEAMSHO_URL is the same public URL (no secrets; not auto-injected without VITE_).
 */
export function getTeamshoUrl(): string {
  const fromEnv = String(import.meta.env.VITE_OMID_TEAMSHO_URL ?? "").trim();
  if (fromEnv) return fromEnv.endsWith("/") ? fromEnv : `${fromEnv}/`;
  return DEFAULT_TEAMSHO_URL;
}

export type PensionPhase = "accumulation" | "guaranteed_10y" | "lifetime";
export type PolStatus = "pending" | "confirmed" | "expired";

export type LifePolicyMeta = {
  first_year_end_reserve?: number;
  premium_escalate_pct?: number;
  sum_insured_escalate_pct?: number;
  initial_reserve?: number;
  annual_premium?: number;
};

export type OmidPlan = {
  id: number;
  customerId?: number | string | null;
  customerLabel?: string;
  policyNumber?: string | null;
  nationalId?: string | null;
  policyholderCode?: string | null;
  insuranceType: string;
  issueDateJalali?: string | null;
  startDateJalali?: string | null;
  endDateJalali?: string | null;
  retirementAge: number;
  accumulationYears: number;
  accumulationRial: number;
  initialMonthlyRial: number;
  lifePolicyMeta?: LifePolicyMeta;
  phase: PensionPhase | string;
  loanBlocked: boolean;
  surrenderBlocked: boolean;
  alive: boolean;
  currentYearIndex?: number;
  currentMonthIndex?: number;
  extra?: Record<string, unknown>;
  demoStub?: boolean;
  disclaimer?: string;
};

export function validateRetirementAge(age: number): { ok: boolean; error?: string } {
  if (!Number.isFinite(age) || !Number.isInteger(age)) {
    return { ok: false, error: `سن باید عدد صحیح ${RETIREMENT_AGE_MIN}–${RETIREMENT_AGE_MAX} باشد` };
  }
  if (age < RETIREMENT_AGE_MIN || age > RETIREMENT_AGE_MAX) {
    return { ok: false, error: `سن بازنشستگی باید بین ${RETIREMENT_AGE_MIN} تا ${RETIREMENT_AGE_MAX} باشد` };
  }
  return { ok: true };
}

/** MonthlyPension_yearN = MonthlyPension_0 * (1.10)^N */
export function compoundMonthly(baseMonthly: number, yearIndex: number): number {
  const n = Math.max(0, Math.floor(yearIndex));
  return Math.round(baseMonthly * Math.pow(1 + COMPOUND_RATE, n));
}

export function demoInitialMonthly(accumulationRial: number, accumulationYears = 10): number {
  const years = Math.max(1, accumulationYears || 1);
  const bump = Math.min(1.1, 1 + 0.005 * Math.max(0, years - 10));
  const monthly = (accumulationRial * bump) / (12 * DEMO_ANNUITY_YEARS);
  return Math.max(1, Math.round(monthly));
}

async function opFetch<T>(path: `/api/omid-pension/${string}`, init?: RequestInit): Promise<T> {
  const res = await apiFetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  return (await res.json()) as T;
}

export async function fetchOmidMeta() {
  try {
    return await opFetch<{ ok: boolean; insuranceType?: string; demoStub?: boolean }>("/api/omid-pension/meta");
  } catch {
    return { ok: false as const, error: "API در دسترس نیست" };
  }
}

export async function simulateOmid(body: {
  retirementAge: number;
  accumulationYears: number;
  accumulationRial?: number;
}) {
  return opFetch<{
    ok: boolean;
    error?: string;
    initialMonthlyRial?: number;
    yearsPreview?: Array<{ yearIndex: number; monthlyRial: number; phase: string }>;
    demoStub?: boolean;
    disclaimer?: string;
  }>("/api/omid-pension/simulate", { method: "POST", body: JSON.stringify(body) });
}

export async function fetchOmidPlans(q?: {
  policyNumber?: string;
  nationalId?: string;
  policyholderCode?: string;
}) {
  const params = new URLSearchParams();
  if (q?.policyNumber) params.set("policyNumber", q.policyNumber);
  if (q?.nationalId) params.set("nationalId", q.nationalId);
  if (q?.policyholderCode) params.set("policyholderCode", q.policyholderCode);
  const qs = params.toString() ? `?${params}` : "";
  try {
    return await opFetch<{ ok: boolean; items: OmidPlan[]; count: number }>(
      `/api/omid-pension/plans${qs}` as `/api/omid-pension/${string}`,
    );
  } catch {
    return { ok: false, items: [] as OmidPlan[], count: 0, error: "API در دسترس نیست" };
  }
}

export async function createOmidPlan(body: Record<string, unknown>) {
  return opFetch<{ ok: boolean; plan?: OmidPlan; error?: string }>("/api/omid-pension/plans", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function transitionOmid(planId: number) {
  return opFetch<{
    ok: boolean;
    plan?: OmidPlan;
    scheduleCount?: number;
    schedulePreview?: Array<Record<string, unknown>>;
    error?: string;
  }>("/api/omid-pension/transition", { method: "POST", body: JSON.stringify({ planId }) });
}

export async function fetchOmidSchedule(planId: number) {
  return opFetch<{
    ok: boolean;
    items: Array<Record<string, unknown>>;
    count: number;
    proofOfLife?: { status: string; blocksAdvance: boolean };
    error?: string;
  }>(`/api/omid-pension/schedule/${planId}` as `/api/omid-pension/${string}`);
}

export async function previewOmidPayout(body: {
  planId: number;
  yearIndex?: number;
  monthIndex?: number;
}) {
  return opFetch<{
    ok: boolean;
    amountRial?: number;
    yearIndex?: number;
    phase?: string;
    blocked?: boolean;
    error?: string;
  }>("/api/omid-pension/payout/preview", { method: "POST", body: JSON.stringify(body) });
}

export async function fetchProofOfLife(planId: number) {
  try {
    return await opFetch<{
      ok: boolean;
      status: PolStatus | string;
      blocksPayoutAdvance?: boolean;
      todo?: string;
    }>(`/api/omid-pension/proof-of-life?planId=${planId}` as `/api/omid-pension/${string}`);
  } catch {
    return { ok: false, status: "pending" as const, error: "API در دسترس نیست" };
  }
}

export async function postProofOfLife(planId: number, status: PolStatus = "confirmed") {
  return opFetch<{ ok: boolean; status?: string; blocksPayoutAdvance?: boolean; error?: string }>(
    "/api/omid-pension/proof-of-life",
    { method: "POST", body: JSON.stringify({ planId, status }) },
  );
}

export async function recordOmidDeath(planId: number) {
  return opFetch<{
    ok: boolean;
    action?: string;
    message?: string;
    remainingScheduleCount?: number;
    stopped?: boolean;
    error?: string;
  }>("/api/omid-pension/death", { method: "POST", body: JSON.stringify({ planId }) });
}
