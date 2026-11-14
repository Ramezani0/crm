/** M5 سنهاب — client helpers. Vehicle inquiry live via BimeBazar partners (honest label). */

import { apiFetch, apiUrl } from "./api";

export const MODULE_LABEL = "سنهاب / بیمه مرکزی";
export const PRODUCT_LABEL = MODULE_LABEL;
export const UNIQUE_CODE_RE = /^SNH-\d{8}-[A-F0-9]{8}$/;
export const DEFAULT_INDUSTRY_CEILING_RIAL = 50_000_000_000;
export const EXPORT_KINDS = ["issuance", "endorsement", "financial_tx"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const DEMO_DISCLAIMER =
  "ماژول سنهاب: استعلام خودرو از طریق بیمه‌بازار (شرکا) — نه سنهاب رسمی بیمه مرکزی. تجمیع فوت / کد یکتا / صف ارسال همچنان DEMO stub. Excel HOLD · بدون wipe CRM · Eng-only این بچ.";

export const VEHICLE_INQUIRY_LABEL_FA = "استعلام از طریق بیمه‌بازار";
export const SOURCE_BIMEBAZAR = "BIMEBAZAR_PARTNER";
export const SOURCE_LABEL_BIMEBAZAR = "بیمه‌بازار";

export type DeathCeilingConfig = {
  ceilingRial: number;
  currency?: string;
  source?: string;
  updatedAt?: string;
  notes?: string;
  demoStub?: boolean;
};

export type DeathInquiry = {
  id: number;
  kind: string;
  nationalId: string;
  knownSumRial: number;
  proposedCapitalRial: number;
  totalAfterRial: number;
  ceilingRial: number;
  overLimit: boolean;
  headroomRial: number;
  excessRial: number;
  manualOverride?: boolean;
  policyNumber?: string | null;
  computerCode?: string | null;
};

export type VehicleInquiry = {
  id: number;
  kind: string;
  plate?: string | null;
  vin?: string | null;
  policyNumber?: string | null;
  computerCode?: string | null;
  thirdPartyNcdPct: number;
  bodyNcdPct: number;
  accidentHistoryCount: number;
  source?: string;
  demoStub?: boolean;
};

/** Live BimeBazar partner vehicle inquiry — only fields present in API response. */
export type LiveVehicleResult = {
  ok: boolean;
  source?: string;
  sourceLabel?: string;
  label?: string;
  demoStub?: boolean;
  lookupStatus?: string;
  userMessage?: string;
  error?: string;
  code?: string;
  sanhabFailed?: boolean;
  persistedPii?: boolean;
  sourceTimestamp?: string;
  query?: {
    plateDisplay?: string | null;
    nationalIdMasked?: string | null;
  };
  vehicle?: {
    make?: string;
    model?: string;
    vin?: string;
    year?: string;
    usage?: string;
    plateParts?: Record<string, string>;
  } | null;
  owner?: {
    matched?: boolean;
    name?: string;
    nationalIdMasked?: string;
    address?: string;
    phone?: string;
  } | null;
  policy?: {
    number?: string;
    insurerCompany?: string;
    branch?: string;
    branchAddress?: string;
    status?: string;
    start?: string;
    end?: string;
  } | null;
  partnerMeta?: Record<string, string> | null;
  availableFields?: string[];
  inquiry?: VehicleInquiry | null;
};

export type UniqueCodeRecord = {
  id: number;
  uniqueCode: string;
  policyNumber: string;
  computerCode?: string | null;
  plate?: string | null;
  vin?: string | null;
  assignedAt?: string;
};

export type ExportQueueItem = {
  id: number;
  kind: ExportKind | string;
  payload: Record<string, unknown>;
  policyNumber?: string | null;
  computerCode?: string | null;
  status: string;
  batchId?: number | null;
  enqueuedAt?: string;
  exportedAt?: string | null;
};

export type ExportBatch = {
  id: number;
  batchCode: string;
  itemCount: number;
  jsonPath: string;
  csvPath: string;
  status: string;
  networkCall?: boolean;
};

/** Pure: compare known + proposed vs ceiling (mirrors Python). */
export function checkDeathOverLimit(
  knownSumRial: number,
  proposedCapitalRial: number,
  ceilingRial: number,
): {
  knownSumRial: number;
  proposedCapitalRial: number;
  totalAfterRial: number;
  ceilingRial: number;
  overLimit: boolean;
  headroomRial: number;
  excessRial: number;
} {
  const known = Math.max(0, Math.trunc(knownSumRial || 0));
  const proposed = Math.max(0, Math.trunc(proposedCapitalRial || 0));
  const ceiling = Math.max(0, Math.trunc(ceilingRial || 0));
  const total = known + proposed;
  const over = total > ceiling;
  return {
    knownSumRial: known,
    proposedCapitalRial: proposed,
    totalAfterRial: total,
    ceilingRial: ceiling,
    overLimit: over,
    headroomRial: Math.max(0, ceiling - known),
    excessRial: over ? Math.max(0, total - ceiling) : 0,
  };
}

export function isValidUniqueCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return UNIQUE_CODE_RE.test(String(code).trim());
}

/** DEMO stub unique-code generator (client preview; server assigns authoritative). */
export function previewUniqueCodeFormat(ymd: string, hex8: string): string {
  return `SNH-${ymd}-${hex8.toUpperCase()}`;
}

async function sanhabFetch<T>(path: `/api/sanhab/${string}`, init?: RequestInit): Promise<T> {
  const res = await apiFetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json()) as T;
  return data;
}

export async function fetchSanhabMeta() {
  return sanhabFetch<{
    ok: boolean;
    label?: string;
    noNetwork?: boolean;
    ceilingRial?: number;
    uniqueCodeFormat?: string;
    counts?: Record<string, number>;
    disclaimer?: string;
    vehicleInquiry?: {
      defaultSource?: string;
      liveSource?: string;
      sourceLabel?: string;
      label?: string;
      persistsPii?: boolean;
      officialSanhab?: boolean;
      bimebazarConfigured?: boolean;
    };
  }>("/api/sanhab/meta");
}

export async function fetchDeathCeiling() {
  return sanhabFetch<{ ok: boolean; config?: DeathCeilingConfig; error?: string }>(
    "/api/sanhab/death-ceiling",
  );
}

export async function putDeathCeiling(ceilingRial: number, notes?: string) {
  return sanhabFetch<{ ok: boolean; config?: DeathCeilingConfig; error?: string }>(
    "/api/sanhab/death-ceiling",
    {
      method: "PUT",
      body: JSON.stringify({ ceilingRial, notes }),
    },
  );
}

export async function postDeathInquiry(body: {
  nationalId: string;
  proposedCapital?: number;
  manualKnownSum?: number;
  policyNumber?: string;
  computerCode?: string;
}) {
  return sanhabFetch<{
    ok: boolean;
    inquiry?: DeathInquiry;
    overLimit?: boolean;
    error?: string;
  }>("/api/sanhab/death-inquiry", { method: "POST", body: JSON.stringify(body) });
}

export type VehicleInquiryRequest = {
  /** Structured Iranian plate — required for live BimeBazar path */
  plate?: {
    platePart1: string;
    plateLetter: string;
    platePart2: string;
    plateIranCode: string;
  };
  nationalId?: string;
  /** Explicit DEMO stub toggle — never silent live fallback */
  demo?: boolean;
  forceDemo?: boolean;
  /** Legacy DEMO-only free-text / VIN */
  vin?: string;
  policyNumber?: string;
  computerCode?: string;
};

export async function postVehicleInquiry(body: VehicleInquiryRequest) {
  return sanhabFetch<LiveVehicleResult>("/api/sanhab/vehicle-inquiry", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function assignUniqueCode(body: {
  policyNumber: string;
  computerCode?: string;
  plate?: string;
  vin?: string;
  force?: boolean;
}) {
  return sanhabFetch<{
    ok: boolean;
    assigned?: boolean;
    uniqueCode?: string;
    record?: UniqueCodeRecord;
    message?: string;
    error?: string;
  }>("/api/sanhab/unique-code", { method: "POST", body: JSON.stringify(body) });
}

export async function fetchUniqueCode(policyNumber: string, computerCode?: string) {
  const qs = new URLSearchParams({ policyNumber });
  if (computerCode) qs.set("computerCode", computerCode);
  return sanhabFetch<{
    ok: boolean;
    found?: boolean;
    uniqueCode?: string | null;
    record?: UniqueCodeRecord | null;
    error?: string;
  }>(`/api/sanhab/unique-code?${qs.toString()}` as `/api/sanhab/${string}`);
}

export async function enqueueExport(body: { kind: ExportKind; payload: Record<string, unknown> }) {
  return sanhabFetch<{ ok: boolean; item?: ExportQueueItem; error?: string }>(
    "/api/sanhab/export-queue",
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function fetchExportQueue(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return sanhabFetch<{
    ok: boolean;
    items?: ExportQueueItem[];
    count?: number;
    queuedCount?: number;
  }>(`/api/sanhab/export-queue${qs}` as `/api/sanhab/${string}`);
}

export async function runExport(ids?: number[]) {
  return sanhabFetch<{
    ok: boolean;
    exported?: number;
    batch?: ExportBatch | null;
    message?: string;
    error?: string;
  }>("/api/sanhab/export/run", {
    method: "POST",
    body: JSON.stringify(ids ? { ids } : {}),
  });
}

export function kindLabel(kind: string): string {
  switch (kind) {
    case "issuance":
      return "صدور";
    case "endorsement":
      return "الحاقیه";
    case "financial_tx":
      return "تراکنش مالی";
    default:
      return kind;
  }
}
