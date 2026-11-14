/** M2 سیما زر — client types + fee/mg helpers. Live tgju preferred over DEMO_STUB. */

import { apiFetch, apiUrl } from "./api";

export const DEFAULT_SYMBOL = "GOB1CD0001";
export const FEE_ENTRY_PCT = 1;
export const FEE_EXIT_PCT = 2;
export const MG_PER_GRAM = 1000;
export const LOAN_BLOCK_REASON_FA = "وام روی این طرح مجاز نیست";
export const SOURCE_LABEL_TGJU =
  "نرخ طلای ۲۴ عیار (معادل گرم) — گواهی سپرده شمش بورس کالا";
export const SOURCE_LABEL_TGJU_FALLBACK = "نرخ طلای ۲۴ عیار — بازار (پشتیبان)";


/** Local fee-math fallback only — never presented as silent live primary. */
export const DEMO_RATE_RIAL_PER_GRAM = 35_000_000;

export type SimaZarRate = {
  ok: boolean;
  symbol: string;
  rialPerGram: number;
  rialPerGramStr?: string;
  rateRialPerGram?: number;
  source: string;
  sourceLabel?: string;
  tgjuSubSource?: string;
  tgjuKey?: string;
  fallback?: boolean;
  asOf: string;
  updatedAt?: string;
  notes?: string;
  loanBlocked: boolean;
  feeEntryPct: number;
  feeExitPct: number;
  demoStub?: boolean;
  live?: boolean;
  configured?: boolean;
  usableAsPrimary?: boolean;
  disclaimer?: string;
  error?: string | null;
};

export type SimaZarPosition = {
  id: number;
  customerId: number | string | null;
  customerLabel: string;
  milligrams: number;
  milligramsStr: string;
  grams: number;
  gramsStr: string;
  loanBlocked: boolean;
  product: string;
  productLabel: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  notes?: string;
};

export type FeePreview = {
  ok: boolean;
  error?: string;
  side?: "entry" | "exit" | string;
  milligrams?: number;
  grams?: number;
  rateRialPerGram?: number;
  assetValueRial?: number;
  feePct?: number;
  feeRial?: number;
  feeKind?: string;
  totalRial?: number;
  netRial?: number;
  loanBlocked?: boolean;
  demoStub?: boolean;
};

export function gramsToMilligrams(grams: number): number {
  if (!Number.isFinite(grams)) return 0;
  return Math.round(grams * MG_PER_GRAM * 1000) / 1000;
}

export function milligramsToGrams(mg: number): number {
  if (!Number.isFinite(mg)) return 0;
  return Math.round((mg / MG_PER_GRAM) * 1_000_000) / 1_000_000;
}

export function roundRial(value: number): number {
  return Math.round(value);
}

/** Local fee math (fallback / unit tests) — same rules as backend. */
export function previewFeesLocal(input: {
  milligrams?: number;
  grams?: number;
  rateRialPerGram?: number;
  side?: "entry" | "exit";
}): FeePreview {
  let mg =
    input.milligrams != null && Number.isFinite(input.milligrams)
      ? input.milligrams
      : input.grams != null
        ? gramsToMilligrams(input.grams)
        : NaN;
  if (!Number.isFinite(mg) || mg <= 0) {
    return { ok: false, error: "مقدار گرم یا میلی‌گرم نامعتبر است" };
  }
  mg = Math.round(mg * 1000) / 1000;
  const grams = milligramsToGrams(mg);
  const rate =
    input.rateRialPerGram && input.rateRialPerGram > 0
      ? input.rateRialPerGram
      : DEMO_RATE_RIAL_PER_GRAM;
  const usedStub = !(input.rateRialPerGram && input.rateRialPerGram > 0);
  const asset = roundRial(grams * rate);
  const side = input.side === "exit" ? "exit" : "entry";
  const feePct = side === "exit" ? FEE_EXIT_PCT : FEE_ENTRY_PCT;
  const feeRial = roundRial(asset * (feePct / 100));
  const totalRial = side === "entry" ? asset + feeRial : Math.max(0, asset - feeRial);
  return {
    ok: true,
    side,
    milligrams: mg,
    grams,
    rateRialPerGram: rate,
    assetValueRial: asset,
    feePct,
    feeRial,
    feeKind: side === "entry" ? "fee_entry" : "fee_exit",
    totalRial,
    netRial: side === "exit" ? totalRial : asset,
    loanBlocked: true,
    demoStub: usedStub,
  };
}

async function szFetch<T>(path: `/api/sima-zar/${string}`, init?: RequestInit): Promise<T> {
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

export async function fetchSimaZarRate(opts?: { refresh?: boolean }): Promise<SimaZarRate> {
  const q = opts?.refresh ? "?refresh=1" : "";
  try {
    return await szFetch(`/api/sima-zar/rate${q}` as `/api/sima-zar/${string}`);
  } catch {
    // Never silently promote DEMO_STUB as primary on transport fail.
    return {
      ok: false,
      error: "API سیما زر در دسترس نیست — نرخ دستی حفظ می‌شود",
      symbol: DEFAULT_SYMBOL,
      rialPerGram: Number.NaN,
      rateRialPerGram: Number.NaN,
      source: "error",
      sourceLabel: "خطا",
      asOf: "",
      updatedAt: "",
      loanBlocked: true,
      feeEntryPct: FEE_ENTRY_PCT,
      feeExitPct: FEE_EXIT_PCT,
      demoStub: false,
      live: false,
      configured: false,
      usableAsPrimary: false,
    };
  }
}

export async function putSimaZarRate(body: {
  rialPerGram: number;
  symbol?: string;
  notes?: string;
}): Promise<SimaZarRate> {
  return szFetch("/api/sima-zar/rate", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function fetchSimaZarPositions(customerId?: string | number): Promise<{
  ok: boolean;
  items: SimaZarPosition[];
  count: number;
  totalMilligrams: number;
  totalGrams: number;
  loanBlocked: boolean;
  loanBlockReason?: string;
  error?: string;
}> {
  const q =
    customerId != null && String(customerId).trim() !== ""
      ? `?customerId=${encodeURIComponent(String(customerId))}`
      : "";
  try {
    return await szFetch(`/api/sima-zar/positions${q}` as `/api/sima-zar/${string}`);
  } catch {
    return {
      ok: false,
      items: [],
      count: 0,
      totalMilligrams: 0,
      totalGrams: 0,
      loanBlocked: true,
      loanBlockReason: LOAN_BLOCK_REASON_FA,
      error: "API در دسترس نیست",
    };
  }
}

export async function previewFeesApi(input: {
  milligrams?: number;
  grams?: number;
  side?: "entry" | "exit";
  useRate?: number;
}): Promise<FeePreview> {
  const params = new URLSearchParams();
  if (input.milligrams != null) params.set("milligrams", String(input.milligrams));
  if (input.grams != null) params.set("grams", String(input.grams));
  if (input.side) params.set("side", input.side);
  if (input.useRate != null) params.set("useRate", String(input.useRate));
  try {
    return await szFetch(`/api/sima-zar/preview?${params}` as `/api/sima-zar/${string}`);
  } catch {
    return previewFeesLocal(input);
  }
}

export async function depositSimaZar(body: {
  customerId?: string | number;
  customerLabel?: string;
  grams?: number;
  milligrams?: number;
  useRate?: number;
  positionId?: number;
}): Promise<{
  ok: boolean;
  error?: string;
  position?: SimaZarPosition;
  deposit?: {
    milligrams: number;
    grams: number;
    assetValueRial: number;
    feeEntryPct: number;
    feeEntryRial: number;
    totalPaidRial: number;
    rateRialPerGram: number;
  };
  loanBlocked?: boolean;
  loanBlockReason?: string;
}> {
  return szFetch("/api/sima-zar/deposit", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function redeemSimaZar(body: {
  positionId: number;
  milligrams?: number;
  grams?: number;
  useRate?: number;
}): Promise<{
  ok: boolean;
  error?: string;
  position?: SimaZarPosition;
  redeem?: {
    milligrams: number;
    grams: number;
    assetValueRial: number;
    feeExitPct: number;
    feeExitRial: number;
    netPayoutRial: number;
    rateRialPerGram: number;
  };
  loanBlocked?: boolean;
  loanBlockReason?: string;
}> {
  return szFetch("/api/sima-zar/redeem", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function loanCheckSimaZar(body?: {
  positionId?: number;
  customerId?: string | number;
}): Promise<{
  ok: boolean;
  allowed: boolean;
  loanBlocked: boolean;
  reason: string;
  reasonCode?: string;
}> {
  try {
    const res = await apiFetch(apiUrl("/api/sima-zar/loan-check"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return (await res.json()) as {
      ok: boolean;
      allowed: boolean;
      loanBlocked: boolean;
      reason: string;
      reasonCode?: string;
    };
  } catch {
    return {
      ok: false,
      allowed: false,
      loanBlocked: true,
      reason: LOAN_BLOCK_REASON_FA,
      reasonCode: "SIMA_ZAR_LOAN_BLOCKED",
    };
  }
}
