/** M8 کارتابل شعب / عملیات نمایندگی — client helpers. DEMO mirrors vps/branch_ops.py */

import { apiFetch, apiUrl } from "./api";

export const MODULE_LABEL = "عملیات شعبه";
export const PRODUCT_LABEL = "کارتابل شعب / عملیات نمایندگی";

export const PAPER_KINDS = ["receipt", "policy_sheet", "hologram"] as const;
export type PaperKind = (typeof PAPER_KINDS)[number];

export const PAPER_KIND_LABELS: Record<PaperKind, string> = {
  receipt: "قبض چاپی",
  policy_sheet: "برگه بیمه‌نامه",
  hologram: "هولوگرام",
};

export const PAPER_STATUSES = [
  "received_from_branch",
  "assigned_to_issue",
  "issued",
  "voided",
] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];

export const PAPER_STATUS_LABELS: Record<PaperStatus, string> = {
  received_from_branch: "دریافت از شعبه",
  assigned_to_issue: "اختصاص صدور",
  issued: "صادر شده",
  voided: "ابطال",
};

export const CHECK_STATUSES = [
  "received",
  "deposited",
  "cleared",
  "bounced",
  "cancelled",
] as const;

export const DEMO_DISCLAIMER =
  "DEMO — اسکلت کارتابل شعب؛ موجودی اوراق/هولوگرام، مغایرت کارمزد، چک بیمه‌گذار. Excel HOLD · بدون wipe CRM · Eng-only این بچ.";

export type StockItem = {
  serial: string;
  kind: PaperKind | string;
  kindLabel?: string;
  status: PaperStatus | string;
  branchCode?: string;
  agencyCode?: string;
  policyNumber?: string | null;
  voidReason?: string | null;
  demoStub?: boolean;
};

export type VarianceItem = {
  id: number;
  agentCode: string;
  agencyAmount: number;
  branchAmount: number;
  variance: number;
  absVariance?: number;
  direction: string;
  note?: string | null;
  periodJalali?: string | null;
  demoStub?: boolean;
};

export type CheckItem = {
  id: number;
  checkNumber: string;
  amountRial: number;
  bankName?: string | null;
  policyholderCode?: string | null;
  policyNumber?: string | null;
  dueJalali?: string | null;
  status: string;
  note?: string | null;
  demoStub?: boolean;
};

/** Expand inclusive DEMO serial range (mirrors Python). */
export function expandSerialRange(
  kind: string,
  serialFrom: string,
  serialTo: string,
): { ok: true; serials: string[] } | { ok: false; error: string } {
  if (!PAPER_KINDS.includes(kind as PaperKind)) {
    return { ok: false, error: `kind نامعتبر؛ مجاز: ${PAPER_KINDS.join(", ")}` };
  }
  const digits = (s: string) => {
    const d = String(s).replace(/\D/g, "");
    return d ? Number(d) : null;
  };
  const a = digits(serialFrom);
  const b = digits(serialTo);
  if (a === null || b === null) return { ok: false, error: "serialFrom/serialTo باید شامل رقم باشند" };
  if (b < a) return { ok: false, error: "serialTo باید ≥ serialFrom باشد" };
  if (b - a > 500) return { ok: false, error: "بازه سریال حداکثر ۵۰۰ عدد (DEMO)" };
  const prefixMap: Record<string, string> = {
    receipt: "REC-",
    policy_sheet: "POL-",
    hologram: "HOLO-",
  };
  let prefix = prefixMap[kind] || "";
  const sf = String(serialFrom).trim();
  if (sf.includes("-")) {
    let i = 0;
    while (i < sf.length && !/\d/.test(sf[i]!)) i++;
    if (i > 0) prefix = sf.slice(0, i);
  }
  const width = Math.max(String(serialFrom).replace(/\D/g, "").length, 4);
  const serials: string[] = [];
  for (let n = a; n <= b; n++) serials.push(`${prefix}${String(n).padStart(width, "0")}`);
  return { ok: true, serials };
}

/** agency − branch. Positive = agency higher than branch kartabl. */
export function calcVariance(
  agencyAmount: number,
  branchAmount: number,
): {
  ok: boolean;
  agencyAmount?: number;
  branchAmount?: number;
  variance?: number;
  absVariance?: number;
  direction?: "agency_higher" | "branch_higher" | "matched";
  error?: string;
} {
  if (!Number.isFinite(agencyAmount) || !Number.isFinite(branchAmount)) {
    return { ok: false, error: "مبالغ باید عدد صحیح (ریال) باشند" };
  }
  const a = Math.trunc(agencyAmount);
  const b = Math.trunc(branchAmount);
  const diff = a - b;
  return {
    ok: true,
    agencyAmount: a,
    branchAmount: b,
    variance: diff,
    absVariance: Math.abs(diff),
    direction: diff > 0 ? "agency_higher" : diff < 0 ? "branch_higher" : "matched",
  };
}

export function directionLabel(d: string): string {
  const map: Record<string, string> = {
    agency_higher: "نمایندگی بیشتر",
    branch_higher: "شعبه بیشتر",
    matched: "تطبیق",
  };
  return map[d] || d;
}

export function kindLabel(kind: string): string {
  return PAPER_KIND_LABELS[kind as PaperKind] || kind;
}

export function statusLabel(status: string): string {
  return PAPER_STATUS_LABELS[status as PaperStatus] || status;
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

export function fetchBranchOpsMeta() {
  return jsonFetch<{
    ok: boolean;
    counts?: Record<string, number>;
    paperKinds?: string[];
    kindLabels?: Record<string, string>;
    paperStatuses?: string[];
    disclaimer?: string;
  }>("/api/branch-ops/meta");
}

export function fetchStock(params?: { kind?: string; status?: string; branchCode?: string }) {
  const qs = new URLSearchParams();
  if (params?.kind) qs.set("kind", params.kind);
  if (params?.status) qs.set("status", params.status);
  if (params?.branchCode) qs.set("branchCode", params.branchCode);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return jsonFetch<{
    ok: boolean;
    items?: StockItem[];
    count?: number;
    byStatus?: Record<string, number>;
    byKind?: Record<string, number>;
    error?: string;
  }>(`/api/branch-ops/stock${suffix}`);
}

export function postStockReceive(body: {
  kind: PaperKind | string;
  serialFrom: string;
  serialTo: string;
  branchCode?: string;
  agencyCode?: string;
}) {
  return jsonFetch<{
    ok: boolean;
    received?: number;
    skipped?: string[];
    items?: StockItem[];
    error?: string;
  }>("/api/branch-ops/stock/receive", { method: "POST", body: JSON.stringify(body) });
}

export function postStockIssue(body: { serial: string; policyNumber?: string }) {
  return jsonFetch<{
    ok: boolean;
    issued?: boolean;
    item?: StockItem;
    error?: string;
    note?: string;
  }>("/api/branch-ops/stock/issue", { method: "POST", body: JSON.stringify(body) });
}

export function postStockVoid(body: { serial: string; reason: string }) {
  return jsonFetch<{
    ok: boolean;
    voided?: boolean;
    item?: StockItem;
    error?: string;
    note?: string;
  }>("/api/branch-ops/stock/void", { method: "POST", body: JSON.stringify(body) });
}

export function fetchVariances(agentCode?: string) {
  const qs = new URLSearchParams();
  if (agentCode) qs.set("agentCode", agentCode);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return jsonFetch<{
    ok: boolean;
    items?: VarianceItem[];
    count?: number;
    totalAbsVariance?: number;
    error?: string;
  }>(`/api/branch-ops/variances${suffix}`);
}

export function postVariance(body: {
  agentCode: string;
  agencyAmount: number;
  branchAmount: number;
  note?: string;
  periodJalali?: string;
}) {
  return jsonFetch<{
    ok: boolean;
    created?: boolean;
    item?: VarianceItem;
    error?: string;
  }>("/api/branch-ops/variances", { method: "POST", body: JSON.stringify(body) });
}

export function fetchChecks(params?: { status?: string; policyholderCode?: string }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.policyholderCode) qs.set("policyholderCode", params.policyholderCode);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return jsonFetch<{
    ok: boolean;
    items?: CheckItem[];
    count?: number;
    error?: string;
  }>(`/api/branch-ops/checks${suffix}`);
}

export function postCheck(body: {
  checkNumber: string;
  amountRial: number;
  bankName?: string;
  policyholderCode?: string;
  policyNumber?: string;
  dueJalali?: string;
  status?: string;
  note?: string;
}) {
  return jsonFetch<{
    ok: boolean;
    created?: boolean;
    item?: CheckItem;
    error?: string;
  }>("/api/branch-ops/checks", { method: "POST", body: JSON.stringify(body) });
}
