import type { ApiCustomer, ApiDataResponse, ApiInstallment, ApiPolicy } from "./api";
import { parseDate } from "./format";
import { inferImportKindFromId } from "./dossier";
import type {
  Customer,
  CustomerStatus,
  Installment,
  InstallmentStatus,
  Policy,
  PolicyStatus,
} from "./types";

const CUSTOMER_STATUSES = new Set<CustomerStatus>(["active", "inactive", "lead"]);
const POLICY_STATUSES = new Set<PolicyStatus>(["active", "expired", "pending", "cancelled"]);
const INSTALLMENT_STATUSES = new Set<InstallmentStatus>(["paid", "due", "overdue", "partial", "history"]);

/** Display-only aliases. Does not write back to Postgres or change source_system. */
const KIND_ALIASES: Record<string, string> = {
  // Persian labels / spacing variants
  "عمر و سرمایه گذاری": "عمر و سرمایه‌گذاری",
  درمان: "درمان تکمیلی",
  "درمان تکمیلی": "درمان تکمیلی",
  "آتش سوزی": "آتش‌سوزی",
  اتومبیل: "شخص ثالث",
  سواری: "شخص ثالث",
  "شخص ثالث": "شخص ثالث",
  بدنه: "بدنه",
  مسئولیت: "مسئولیت",
  مهندسی: "مهندسی",
  باربری: "باربری",
  // Live import / API snake_case codes (kind + kindRaw) → dashboard FIELD_CARD_KINDS
  third_party_auto: "شخص ثالث",
  body_auto: "بدنه",
  universal_life: "عمر و سرمایه‌گذاری",
  omid_retirement: "عمر و سرمایه‌گذاری",
  fire: "آتش‌سوزی",
  fire_family: "آتش‌سوزی",
  liability_employer: "مسئولیت",
  liability_civil: "مسئولیت",
  liability_doctors: "مسئولیت",
  liability_construction: "مسئولیت",
  liability_omrani: "مسئولیت",
};

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/** Keep identifier strings intact (leading zeros). Never pad or invent digits. */
export function asIdentifier(value: unknown): string {
  return asString(value);
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(asString(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function kindLookupKey(raw: string): string {
  return raw
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Map live kind labels for the UI. Unknown values are kept as-is (no forced عمر). */
export function displayPolicyKind(raw: unknown): string {
  const text = asString(raw).trim();
  if (!text) return "";
  return KIND_ALIASES[kindLookupKey(text)] ?? text;
}

function customerStatus(raw: unknown): CustomerStatus {
  const s = asString(raw).trim() as CustomerStatus;
  return CUSTOMER_STATUSES.has(s) ? s : "active";
}

function policyStatus(raw: unknown): PolicyStatus {
  const s = asString(raw).trim() as PolicyStatus;
  return POLICY_STATUSES.has(s) ? s : "active";
}

function parseDueDate(raw: unknown): Date | null {
  return parseDate(asString(raw).trim());
}

const HOLDER_CODE_KEYS = ["holderCode", "holder_code", "کد بیمه‌گذار", "کد بیمه گذار"] as const;

/**
 * کد بیمه‌گذار from camelCase, snake_case, or extras.
 * Never falls back to nationalId or agency 3045.
 */
export function pickHolderCode(
  row: {
    holderCode?: unknown;
    holder_code?: unknown;
    extras?: Record<string, unknown> | null;
  },
): string {
  const extras = row.extras && typeof row.extras === "object" ? row.extras : undefined;
  const candidates: unknown[] = [row.holderCode, row.holder_code];
  if (extras) {
    for (const key of HOLDER_CODE_KEYS) candidates.push(extras[key]);
  }
  for (const value of candidates) {
    const text = asIdentifier(value).trim();
    if (text) return asIdentifier(value).trim();
  }
  return "";
}

/** Copy installment/customer holder_code onto policies when the policy field is empty. */
export function fillPolicyHolderCodes<T extends { id: string; holderCode?: string; customerId?: string }>(
  policies: T[],
  installments: Array<{ policyId?: string; holderCode?: string }>,
  customers: Array<{ id: string; holderCode?: string }> = [],
): T[] {
  const byPolicy = new Map<string, string>();
  for (const inst of installments) {
    const code = (inst.holderCode ?? "").trim();
    const pid = (inst.policyId ?? "").trim();
    if (!pid || !code || byPolicy.has(pid)) continue;
    byPolicy.set(pid, code);
  }
  const byCustomer = new Map<string, string>();
  for (const c of customers) {
    const code = (c.holderCode ?? "").trim();
    if (c.id && code) byCustomer.set(c.id, code);
  }
  return policies.map((policy) => {
    if ((policy.holderCode ?? "").trim()) return policy;
    const fromInst = byPolicy.get(policy.id);
    if (fromInst) return { ...policy, holderCode: fromInst };
    const fromCustomer = policy.customerId ? byCustomer.get(policy.customerId) : undefined;
    if (fromCustomer) return { ...policy, holderCode: fromCustomer };
    return policy;
  });
}

/**
 * Derive paid/partial/due/overdue/history for display.
 * BNVer HIST rows (status=history) stay history — never open/overdue debt.
 * Amounts first, then سررسید for real installments only.
 */
export function deriveInstallmentStatus(
  row: Pick<ApiInstallment, "amount" | "paidAmount" | "dueDate" | "status"> & {
    statusLabel?: string | null;
    kind?: string | null;
    id?: string | null;
  },
  asOf: Date,
): InstallmentStatus {
  const amount = asNumber(row.amount);
  const paid = asNumber(row.paidAmount);
  if (amount > 0 && paid >= amount) return "paid";
  const wired = asString(row.status).trim().toLowerCase();
  const label = asString(row.statusLabel).trim().toLowerCase();
  const kind = asString(row.kind).trim().toLowerCase();
  const id = asString(row.id).trim().toUpperCase();
  // HIST / policy-history ledger rows are not open installments (even if API coerced overdue).
  if (
    wired === "history" ||
    label === "history" ||
    kind.startsWith("hist:") ||
    id.startsWith("I-HIST-")
  ) {
    return "history";
  }
  if (paid > 0) return "partial";
  // DB "unpaid" → derive from due date (not a forced overdue without سررسید).
  const due = parseDueDate(row.dueDate);
  if (due) {
    const startOfDue = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
    const startOfAsOf = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
    return startOfDue < startOfAsOf ? "overdue" : "due";
  }
  if (wired === "unpaid") return "overdue";
  return INSTALLMENT_STATUSES.has(wired as InstallmentStatus) ? (wired as InstallmentStatus) : "overdue";
}

function asExtras(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const text = asString(raw).trim();
    if (text) out[key] = text;
  }
  return Object.keys(out).length ? out : undefined;
}

export function mapCustomer(row: ApiCustomer, index: number): Customer {
  const id = asIdentifier(row.id) || `tmp-C-${index}`;
  const segment = asString(row.segment).includes("حقوقی") ? "حقوقی" : "حقیقی";
  const extras = asExtras(row.extras);
  return {
    id,
    fullName: asString(row.fullName),
    nationalId: asIdentifier(row.nationalId),
    legalEntityId: asIdentifier(
      row.legalEntityId ?? (row as { legal_entity_id?: unknown }).legal_entity_id,
    ),
    holderCode: pickHolderCode(row),
    phone: asString(row.phone || (row as { mobile?: unknown }).mobile),
    email: asString(row.email),
    city: asString(row.city),
    status: customerStatus(row.status),
    statusLabel: asString(row.statusLabel),
    segment,
    agent: asString(row.agent),
    createdAt: asString(row.createdAt),
    note: asString(row.note),
    address: asString(row.address),
    fatherName: asString(row.fatherName),
    birthDate: asString(row.birthDate),
    postalCode: asIdentifier(row.postalCode),
    extras,
  };
}


/** Optional numeric from top-level or extras (camelCase + optional aliases). Undefined when absent/blank. */
function pickOptionalNumber(
  row: Record<string, unknown>,
  key: string,
  extras?: Record<string, string>,
  aliases: string[] = [],
): number | undefined {
  const keys = [key, ...aliases];
  for (const k of keys) {
    const top = row[k];
    if (top != null && String(top).trim() !== "") {
      const n = asNumber(top, Number.NaN);
      if (Number.isFinite(n)) return n;
    }
  }
  if (extras) {
    for (const k of keys) {
      if (extras[k] != null && String(extras[k]).trim() !== "") {
        const n = asNumber(extras[k], Number.NaN);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return undefined;
}

export function mapPolicy(row: ApiPolicy, index: number): Policy {
  const extras = asExtras(row.extras);
  const computerCode = asIdentifier(row.computerCode);
  const number = asString(row.number).trim() || computerCode;
  return {
    id: asIdentifier(row.id) || `tmp-P-${index}`,
    number,
    customerId: asIdentifier(row.customerId),
    kind: displayPolicyKind(row.kind || row.kindRaw),
    kindRaw: asString(row.kindRaw || row.kind),
    company: asString(row.company),
    premium: asNumber(row.premium),
    initialPremium: pickOptionalNumber(row as Record<string, unknown>, "initialPremium", extras, [
      "initial_premium",
    ]),
    initialPremiumStart: pickOptionalNumber(
      row as Record<string, unknown>,
      "initialPremiumStart",
      extras,
      ["initial_premium_start"],
    ),
    premiumAdjPct: pickOptionalNumber(row as Record<string, unknown>, "premiumAdjPct", extras, [
      "premium_adj_pct",
    ]),
    startDate: asString(row.startDate),
    endDate: asString(row.endDate),
    issueDate: asString(row.issueDate),
    status: policyStatus(row.status),
    statusLabel: asString(row.statusLabel),
    installmentCount: Math.max(0, Math.round(asNumber(row.installmentCount, 1))),
    computerCode,
    holderNationalId: asIdentifier(row.holderNationalId),
    holderName: asString(row.holderName),
    holderCode: pickHolderCode(row),
    extras,
  };
}

export function mapInstallment(row: ApiInstallment, index: number, asOf: Date): Installment {
  const extras = asExtras(row.extras);
  const payments = Array.isArray(row.payments)
    ? row.payments.map((p, i) => ({
        id: asIdentifier(p.id) || `tmp-PM-${index}-${i}`,
        amount: asNumber(p.amount),
        date: asString(p.date),
        method: asString(p.method),
        by: asString(p.by),
      }))
    : [];
  const raw = row as Record<string, unknown>;
  const unpaidRaw =
    raw.unpaidAmount ?? raw.unpaid_amount ?? (extras ? extras.unpaidAmount ?? extras.unpaid_amount : undefined);
  let unpaidAmount: number | null | undefined;
  if (unpaidRaw != null && String(unpaidRaw).trim() !== "") {
    unpaidAmount = asNumber(unpaidRaw);
  } else {
    unpaidAmount = null;
  }
  const wiredKind = asString(raw.kind ?? (extras ? extras.kind : undefined));
  const statusLabel = asString(row.statusLabel);
  const id = asIdentifier(row.id) || `tmp-I-${index}`;
  // Live /api/customers/:id omits kind — recover from I-{kind}-… id prefix (Path A).
  const kind = wiredKind || inferImportKindFromId(id) || "";
  return {
    id,
    policyId: asIdentifier(row.policyId),
    customerId: asIdentifier(row.customerId),
    seq: Math.max(1, Math.round(asNumber(row.seq, 1))),
    amount: asNumber(row.amount),
    paidAmount: asNumber(row.paidAmount),
    unpaidAmount,
    dueDate: asString(row.dueDate),
    status: deriveInstallmentStatus(
      {
        amount: row.amount,
        paidAmount: row.paidAmount,
        dueDate: row.dueDate,
        status: row.status,
        statusLabel,
        kind,
        id,
      },
      asOf,
    ),
    statusLabel,
    kind: kind || undefined,
    computerCode: asIdentifier(row.computerCode),
    holderCode: pickHolderCode(row),
    payerNationalId: asIdentifier(row.payerNationalId),
    insuredNationalId: asIdentifier(row.insuredNationalId),
    paymentMethod: asString(row.paymentMethod),
    paidDate: asString(row.paidDate),
    payments,
    extras,
  };
}

export type CrmSnapshot = {
  customers: Customer[];
  policies: Policy[];
  installments: Installment[];
};

/** Map GET /api/data into store entities. Read-only — never mutates the VPS database. */
export function mapApiSnapshot(data: ApiDataResponse, asOf: Date = new Date()): CrmSnapshot {
  const customers = (data.customers ?? []).map(mapCustomer);
  const installments = (data.installments ?? []).map((row, i) => mapInstallment(row, i, asOf));
  const instCountByPolicy = new Map<string, number>();
  for (const inst of installments) {
    if (!inst.policyId) continue;
    instCountByPolicy.set(inst.policyId, (instCountByPolicy.get(inst.policyId) ?? 0) + 1);
  }
  const policies = fillPolicyHolderCodes(
    (data.policies ?? []).map((row, i) => {
      const policy = mapPolicy(row, i);
      const liveCount = instCountByPolicy.get(policy.id);
      if (liveCount && liveCount > 0) policy.installmentCount = liveCount;
      return policy;
    }),
    installments,
    customers,
  );
  return { customers, policies, installments };
}
