/** M4 درمان گروهی — client helpers. DEMO mirrors vps/group_health.py */

import { apiFetch, apiUrl } from "./api";

export const PRODUCT_LABEL = "درمان گروهی";
export const PRODUCT_CODE = "group_health";
export const DEFAULT_FRANCHISE_PCT = 10;
export const DEMO_DISCLAIMER =
  "DEMO — اسکلت درمان گروهی؛ تعرفه کالیفرنیا/ارزش نسبی stub؛ ClaimPayout=min((ApprovedTariff−BasicShare)×(1−Franchise),RemainingCeiling). Excel HOLD · بدون wipe CRM.";

export const CATEGORIES = ["hospital", "paraclinic", "dental", "maternity"] as const;
export type BenefitCategory = (typeof CATEGORIES)[number];

export type GhContract = {
  id: number;
  contractCode: string;
  employerName: string;
  policyNumber?: string | null;
  policyholderCode?: string | null;
  productCode: string;
  franchisePct: number;
  memberCount?: number;
  startDateJalali?: string | null;
  endDateJalali?: string | null;
  demoStub?: boolean;
};

export type GhMember = {
  id: number;
  contractId: number;
  memberCode: string;
  fullName: string;
  nationalId?: string | null;
  status: string;
  daysEnrolled?: number;
  enrollmentJalali?: string | null;
};

export type GhCeiling = {
  ok: boolean;
  memberId?: number;
  memberName?: string;
  category?: string;
  ceilingRial?: number;
  usedRial?: number;
  remainingRial?: number;
  franchisePct?: number;
  error?: string;
};

export type GhReferral = {
  id: number;
  memberId: number;
  memberName?: string;
  type: string;
  serviceCode?: string | null;
  franchisePct: number;
  ceilingRemainingRial: number;
  status: string;
  issuedAtJalali?: string;
};

export type GhClaim = {
  id: number;
  memberId: number;
  memberName?: string;
  kind: string;
  serviceCode?: string | null;
  invoiceAmountRial: number;
  approvedTariffRial: number;
  franchisePct: number;
  franchiseRial: number;
  payoutRial: number;
  status: string;
  tariffMatch?: boolean;
};

export type GhTariff = {
  serviceCode: string;
  titleFa: string;
  category: string;
  approvedRial: number;
  relativeValue?: number;
};

/** سقف مانده = ceiling - used (floor 0) */
export function remainingCeiling(ceilingRial: number, usedRial: number): number {
  const rem = Math.floor(ceilingRial) - Math.floor(usedRial);
  return rem > 0 ? rem : 0;
}

/**
 * ClaimPayout = min((ApprovedTariff - BasicShare) * (1 - Franchise), RemainingSublimit)
 */
export function computeClaimPayout(
  approvedTariff: number,
  basicShare: number,
  franchisePct: number,
  remainingSublimit: number,
): {
  franchiseRial: number;
  payoutRial: number;
  afterFranchiseRial: number;
} {
  const tariff = Math.max(0, Math.floor(approvedTariff));
  const basic = Math.max(0, Math.floor(basicShare));
  let net = tariff - basic;
  if (net < 0) net = 0;
  let fr = franchisePct;
  if (!Number.isFinite(fr) || fr < 0) fr = 0;
  if (fr > 100) fr = 100;
  const franchiseRial = Math.round(net * (fr / 100));
  const after = Math.max(0, net - franchiseRial);
  const rem = Math.max(0, Math.floor(remainingSublimit));
  return {
    franchiseRial,
    afterFranchiseRial: after,
    payoutRial: Math.min(after, rem),
  };
}

export function checkWaitingBlock(
  daysEnrolled: number,
  waitingDays: number,
): { blocked: boolean; remainingWaitDays: number } {
  const enrolled = Math.max(0, Math.floor(daysEnrolled));
  const need = Math.max(0, Math.floor(waitingDays));
  const blocked = enrolled < need;
  return {
    blocked,
    remainingWaitDays: blocked ? need - enrolled : 0,
  };
}

async function ghFetch<T>(path: `/api/group-health/${string}`, init?: RequestInit): Promise<T> {
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

export async function fetchGhMeta() {
  try {
    return await ghFetch<{
      ok: boolean;
      productCode?: string;
      engExtension?: boolean;
      disclaimer?: string;
    }>("/api/group-health/meta");
  } catch {
    return { ok: false as const, error: "API در دسترس نیست" };
  }
}

export async function fetchGhContracts() {
  try {
    return await ghFetch<{ ok: boolean; items: GhContract[]; count: number }>(
      "/api/group-health/contracts",
    );
  } catch {
    return { ok: false, items: [] as GhContract[], count: 0, error: "API در دسترس نیست" };
  }
}

export async function fetchGhMembers(contractId?: number) {
  const qs = contractId != null ? `?contractId=${contractId}` : "";
  try {
    return await ghFetch<{ ok: boolean; items: GhMember[]; count: number }>(
      `/api/group-health/members${qs}` as `/api/group-health/${string}`,
    );
  } catch {
    return { ok: false, items: [] as GhMember[], count: 0 };
  }
}

export async function fetchGhCeiling(memberId: number, category: string) {
  return ghFetch<GhCeiling>(
    `/api/group-health/ceiling?memberId=${memberId}&category=${encodeURIComponent(category)}` as `/api/group-health/${string}`,
  );
}

export async function issueGhReferral(body: {
  memberId: number;
  type: "hospital" | "paraclinic";
  serviceCode?: string;
}) {
  return ghFetch<{
    ok: boolean;
    referral?: GhReferral;
    preview?: { franchisePct: number; ceilingRemainingRial: number };
    error?: string;
    blocked?: boolean;
    waiting?: { remainingWaitDays?: number };
  }>("/api/group-health/referral", { method: "POST", body: JSON.stringify(body) });
}

export async function fetchGhReferrals() {
  try {
    return await ghFetch<{ ok: boolean; items: GhReferral[]; count: number }>(
      "/api/group-health/referrals",
    );
  } catch {
    return { ok: false, items: [] as GhReferral[], count: 0 };
  }
}

export async function registerGhClaim(body: {
  memberId: number;
  kind: "outpatient" | "dental";
  amount: number;
  serviceCode?: string;
}) {
  return ghFetch<{
    ok: boolean;
    claim?: GhClaim;
    error?: string;
  }>("/api/group-health/claims", { method: "POST", body: JSON.stringify(body) });
}

export async function fetchGhClaims() {
  try {
    return await ghFetch<{ ok: boolean; items: GhClaim[]; count: number }>(
      "/api/group-health/claims",
    );
  } catch {
    return { ok: false, items: [] as GhClaim[], count: 0 };
  }
}

export async function fetchGhTariff(code?: string) {
  const qs = code ? `?code=${encodeURIComponent(code)}` : "";
  try {
    return await ghFetch<{ ok: boolean; items: GhTariff[]; item?: GhTariff; count: number }>(
      `/api/group-health/tariff${qs}` as `/api/group-health/${string}`,
    );
  } catch {
    return { ok: false, items: [] as GhTariff[], count: 0 };
  }
}

export async function postPersonnelAmendment(body: {
  contractId: number;
  adds?: Array<{ memberCode: string; fullName?: string }>;
  removes?: string[];
  asOfJalali: string;
  csv?: string;
}) {
  return ghFetch<{
    ok: boolean;
    amendment?: { addsCount: number; removesCount: number; asOfJalali: string };
    crmWipe?: boolean;
    error?: string;
  }>("/api/group-health/personnel/amendment", { method: "POST", body: JSON.stringify(body) });
}

export async function fetchGhWaiting(memberId: number, benefit: string) {
  return ghFetch<{
    ok: boolean;
    blocked?: boolean;
    waitingDays?: number;
    daysEnrolled?: number;
    remainingWaitDays?: number;
    benefit?: string;
    memberName?: string;
    error?: string;
  }>(
    `/api/group-health/waiting?memberId=${memberId}&benefit=${encodeURIComponent(benefit)}` as `/api/group-health/${string}`,
  );
}

export function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    hospital: "بیمارستانی",
    paraclinic: "پاراکلینیک",
    dental: "دندان‌پزشکی",
    maternity: "زایمان",
    outpatient: "سرپایی",
    surgery: "جراحی",
  };
  return map[cat] || cat;
}
