import { relativeDays } from "./format";
import type { Installment, Policy } from "./types";

export function customerIdAliases(customer: {
  id?: string | null;
  nationalId?: string | null;
  holderCode?: string | null;
}): string[] {
  const cid = (customer.id ?? "").trim();
  const nid = (customer.nationalId ?? "").trim();
  const holder = (customer.holderCode ?? "").trim();
  const aliases = new Set<string>();
  if (cid) aliases.add(cid);
  if (nid) {
    aliases.add(nid);
    aliases.add(`C-${nid}`);
  }
  if (holder) aliases.add(holder);
  return [...aliases];
}

/** Decode route param and match id, nationalId, or C-{nationalId}. */
export function findCustomerByParam<T extends { id: string; nationalId?: string }>(
  customers: T[],
  raw: string,
): T | undefined {
  let key = raw.trim();
  try {
    key = decodeURIComponent(key).trim();
  } catch {
    /* keep raw */
  }
  if (!key) return undefined;
  return customers.find((c) => customerIdAliases(c).includes(key) || c.id === key);
}

export function dossierHolderCodes(
  policies: Array<{ holderCode?: string | null }>,
  installments: Array<{ holderCode?: string | null }>,
): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of [...policies, ...installments]) {
    const code = (row.holderCode ?? "").trim();
    if (code && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out.join("، ");
}

export function upsertById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return current;
  const map = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) {
    if (row.id) map.set(row.id, row);
  }
  return Array.from(map.values());
}

export function relatedPolicies(
  policies: Policy[],
  customerId: string,
  customer?: { id: string; nationalId?: string; holderCode?: string | null } | null,
): Policy[] {
  const aliases = new Set<string>([customerId, ...(customer ? customerIdAliases(customer) : [])]);
  aliases.delete("");
  const holder = (customer?.holderCode ?? "").trim();
  if (holder) aliases.add(holder);
  return policies.filter((p) => {
    if (aliases.has(p.customerId)) return true;
    const ph = (p.holderCode ?? "").trim();
    return Boolean(ph && aliases.has(ph));
  });
}

/**
 * Match installments for the open dossier only.
 * When an installment carries holderCode, it must match this holder's codes —
 * never pull another holder's HIST/UL ledger via loose policyId alone.
 */
export function relatedInstallments(
  installments: Installment[],
  customerId: string,
  policyIds: ReadonlySet<string>,
  customer?: { id: string; nationalId?: string; holderCode?: string | null } | null,
): Installment[] {
  const aliases = new Set<string>([customerId, ...(customer ? customerIdAliases(customer) : [])]);
  aliases.delete("");
  const holder = (customer?.holderCode ?? "").trim();
  if (holder) aliases.add(holder);
  return installments.filter((i) => {
    const rowHolder = (i.holderCode ?? "").trim();
    if (rowHolder && !aliases.has(rowHolder)) return false;
    if (aliases.has(i.customerId)) return true;
    if (rowHolder && aliases.has(rowHolder)) return true;
    // Only attach by policy when the row has no conflicting holder and belongs to a dossier policy.
    if (!rowHolder && i.policyId !== "" && policyIds.has(i.policyId)) return true;
    return false;
  });
}

/** Open ledger statuses — HIST/BNVer history is never open debt. */
export const OPEN_INSTALLMENT_STATUSES = new Set<Installment["status"]>([
  "due",
  "overdue",
  "partial",
]);

export type DebtSummary = {
  installmentCount: number;
  /** Count of real open installments (excludes history). */
  openCount: number;
  overdueCount: number;
  unpaidCount: number;
  overdueBalance: number;
  unpaidBalance: number;
  paidTotal: number;
  paidCount: number;
  historyCount: number;
  /** Live `/api/data` often ships paidAmount=0 — remaining is then approximate. */
  approximate: boolean;
};

/** BNVer / UL version ledger — never open debt. */
export function isHistoryInstallment(
  i: Pick<Installment, "status" | "statusLabel" | "kind" | "id">,
): boolean {
  if (i.status === "history") return true;
  const label = (i.statusLabel ?? "").trim().toLowerCase();
  if (label === "history") return true;
  const kind = (i.kind ?? "").trim().toLowerCase();
  if (kind.startsWith("hist:")) return true;
  const id = (i.id ?? "").trim().toUpperCase();
  return id.startsWith("I-HIST-");
}

/**
 * Live dossier/customer API often omits `kind`; import kind is encoded in the id
 * prefix: I-followup-…, I-unpaid_d-…, I-delay_70-…, I-collecti-…, I-HIST-….
 */
export function inferImportKindFromId(id: string | null | undefined): string | undefined {
  const raw = (id ?? "").trim();
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (upper.startsWith("I-HIST-") || upper.startsWith("I-HIST:")) {
    const histIdx = upper.indexOf("HIST");
    const rest = raw.slice(histIdx + 4).replace(/^[-:]/, "");
    const slug = rest.split(/[-/]/)[0] || "";
    return slug ? `HIST:${slug}` : "HIST:";
  }
  const m = /^I-([A-Za-z0-9_]+)-/i.exec(raw);
  if (!m) return undefined;
  const token = m[1].toLowerCase();
  if (token.startsWith("followup") || token === "follow") return "followup";
  if (token.startsWith("unpaid_d") || token === "unpaid_due") return "unpaid_due";
  if (token.startsWith("delay")) return token; // delay_70 / delay_700
  if (token.startsWith("collect")) return "collection_detail";
  return token;
}

/** Prefer wired `kind`, else id-prefix inference (live dossier omit-kind FACT). */
export function effectiveImportKind(
  i: Pick<{ kind?: string | null; id?: string | null }, "kind" | "id">,
): string {
  const direct = (i.kind ?? "").trim();
  if (direct) return direct;
  return inferImportKindFromId(i.id) ?? "";
}


/**
 * Live dossier rows often ship empty policyId/computerCode; the import policy
 * number is embedded in the id: I-{kind}-2215/1403/18/{pol}-… or I-delay_70-…/{pol}---…
 * Used so unpaid_due ↔ delay_* (and followup twins) collapse on Path A.
 */
export function policyKeyFromInstallment(
  i: Pick<Installment, "policyId" | "computerCode" | "id">,
): string {
  const wired = (i.policyId || i.computerCode || "").trim();
  if (wired) return wired;
  const id = (i.id ?? "").trim();
  if (!id) return "";
  // I-{kind}-{agency}/{year}/{branch}/{pol}-…  or  I-{kind}-{agency}/{year}/{branch}/{pol}---…
  const m = /^I-[A-Za-z0-9_]+-(\d+\/\d+\/\d+\/\d+)/i.exec(id);
  if (m) return m[1];
  return id;
}


/**
 * Open-debt import kinds (CoS Path A): unpaid_due* + delay* only.
 * Named kinds outside this allowlist (followup / collection_detail / …) never
 * contribute to open debt — even when unpaid_amount is set (live ×2 FIX).
 * Empty kind (no id inference) keeps legacy amount−paid for non-import rows.
 */
export function isOpenDebtKind(kind: string | null | undefined): boolean {
  const k = (kind ?? "").trim().toLowerCase();
  if (!k) return false;
  if (k === "unpaid_due" || k.startsWith("unpaid_due")) return true;
  if (k.startsWith("delay")) return true;
  return false;
}

/** Prefer unpaid_due over delay_* when collapsing the same policy. */
function openDebtKindRank(kind: string | null | undefined): number {
  const k = (kind ?? "").trim().toLowerCase();
  if (k === "unpaid_due" || k.startsWith("unpaid_due")) return 3;
  if (k.startsWith("delay")) return 1;
  return 2;
}

/**
 * Remaining debt for one installment.
 * Prefer import unpaid_amount when present (incl. 0); else amount − paid.
 * HIST always 0. Path A: non-allowlist named kinds (followup, …) always 0.
 */
export function remainingAmount(
  i: Pick<Installment, "amount" | "paidAmount" | "unpaidAmount" | "status" | "statusLabel" | "kind" | "id">,
): number {
  if (isHistoryInstallment(i)) return 0;
  const kind = effectiveImportKind(i);
  // followup / collection_detail / other named non-allowlist — never open debt
  if (kind && !isOpenDebtKind(kind)) {
    return 0;
  }
  const hasUnpaid = i.unpaidAmount != null && Number.isFinite(i.unpaidAmount);
  if (hasUnpaid) {
    return Math.max(0, i.unpaidAmount as number);
  }
  return Math.max(0, i.amount - i.paidAmount);
}

/**
 * Days past due for an unpaid overdue installment only.
 * Uses dueDate (سررسید قسط), never policy start. Returns NaN when not overdue.
 */
export function overdueDays(
  i: Pick<Installment, "status" | "dueDate" | "amount" | "paidAmount" | "unpaidAmount" | "statusLabel" | "kind" | "id">,
  asOf: Date,
): number {
  if (isHistoryInstallment(i) || i.status === "paid") return Number.NaN;
  if (remainingAmount(i) <= 0) return Number.NaN;
  const days = relativeDays(i.dueDate, asOf);
  if (!Number.isFinite(days) || days >= 0) return Number.NaN;
  // Only count as overdue days when status is overdue (or past due with remaining).
  if (i.status !== "overdue" && i.status !== "partial") return Number.NaN;
  return Math.abs(days);
}

/**
 * Dedupe key for open debt.
 * unpaid_due ↔ delay*: policy-only so blank due_date on delay still merges.
 * Other kinds: policy|due (or seq when due blank).
 */
export function openDebtDedupeKey(
  i: Pick<Installment, "policyId" | "computerCode" | "id" | "dueDate" | "seq" | "kind">,
): string {
  const policyKey = policyKeyFromInstallment(i) || i.id;
  const kind = effectiveImportKind(i).toLowerCase();
  if (kind === "unpaid_due" || kind.startsWith("unpaid_due") || kind.startsWith("delay")) {
    return `pol:${policyKey}`;
  }
  // followup / collection twin the same policy — still policy-keyed so they
  // never sit beside unpaid_due as a second open row after Path A rem=0.
  if (kind === "followup" || kind.startsWith("follow") || kind === "collection_detail" || kind.startsWith("collect")) {
    return `pol:${policyKey}`;
  }
  const dueKey = (i.dueDate || "").trim() || `seq:${i.seq}`;
  return `${policyKey}|${dueKey}`;
}

/** Collapse duplicate open rows: unpaid_due preferred over delay_* on same policy. */
export function dedupeOpenInstallments(installments: Installment[]): Installment[] {
  const best = new Map<string, Installment>();
  for (const i of installments) {
    if (isHistoryInstallment(i)) continue;
    // Path A: only unpaid_due* + delay* may enter open-debt (followup never).
    const kind = effectiveImportKind(i);
    if (kind && !isOpenDebtKind(kind)) continue;
    const rem = remainingAmount(i);
    if (i.status === "paid" || rem <= 0) continue;
    const key = openDebtDedupeKey(i);
    const prev = best.get(key);
    if (!prev) {
      best.set(key, i);
      continue;
    }
    const prevRem = remainingAmount(prev);
    const iRank = openDebtKindRank(effectiveImportKind(i));
    const prevRank = openDebtKindRank(effectiveImportKind(prev));
    const iHasUnpaid = i.unpaidAmount != null && Number.isFinite(i.unpaidAmount);
    const prevHasUnpaid = prev.unpaidAmount != null && Number.isFinite(prev.unpaidAmount);
    // Prefer higher arrears; then higher kind rank (unpaid_due > delay); then explicit unpaid.
    if (
      rem > prevRem ||
      (rem === prevRem && iRank > prevRank) ||
      (rem === prevRem && iRank === prevRank && iHasUnpaid && !prevHasUnpaid)
    ) {
      best.set(key, i);
    }
  }
  return [...best.values()];
}

export function summarizeDebt(installments: Installment[]): DebtSummary {
  let paidTotal = 0;
  let paidCount = 0;
  let historyCount = 0;
  let anyPaidRecorded = false;

  for (const i of installments) {
    paidTotal += i.paidAmount;
    if (i.paidAmount > 0) anyPaidRecorded = true;
    if (isHistoryInstallment(i)) {
      historyCount += 1;
      continue;
    }
    const remaining = remainingAmount(i);
    if (i.status === "paid" || remaining <= 0) {
      paidCount += 1;
    }
  }

  const openRows = dedupeOpenInstallments(installments);
  let overdueCount = 0;
  let unpaidCount = 0;
  let overdueBalance = 0;
  let unpaidBalance = 0;

  for (const i of openRows) {
    const remaining = remainingAmount(i);
    unpaidCount += 1;
    unpaidBalance += remaining;
    // Past-due open rows → معوق; future due/partial stay in مانده only.
    if (i.status === "overdue") {
      overdueCount += 1;
      overdueBalance += remaining;
    }
  }

  return {
    installmentCount: installments.length,
    openCount: unpaidCount,
    overdueCount,
    unpaidCount,
    overdueBalance,
    unpaidBalance,
    paidTotal,
    paidCount,
    historyCount,
    approximate: unpaidBalance > 0 && !anyPaidRecorded,
  };
}

export function debtCaption(summary: DebtSummary): string {
  if (summary.installmentCount === 0) return "قسطی برای این بیمه‌گذار در دادهٔ فعلی نیست.";
  if (summary.approximate) {
    return "مانده تقریبی است: فقط اقساط باز/معوق (بدون HIST). در دادهٔ زنده معمولاً پرداخت ثبت نشده.";
  }
  return "معوق فقط سررسیدگذشتهٔ پرداخت‌نشده است؛ مانده همهٔ اقساط باز است (HIST شمارش نمی‌شود).";
}

export type InstallmentProgress = {
  paidCount: number;
  totalOpenOrPaid: number;
  lastPaid?: Installment;
  paid: Installment[];
  open: Installment[];
  overdue: Installment[];
  history: Installment[];
};

/** Split dossier installments for Amir UI: paid / progress N of M / open+overdue. */
export function partitionInstallments(installments: Installment[]): InstallmentProgress {
  const paid: Installment[] = [];
  const open: Installment[] = [];
  const overdue: Installment[] = [];
  const history: Installment[] = [];
  for (const i of installments) {
    if (isHistoryInstallment(i)) {
      history.push(i);
      continue;
    }
    const remaining = remainingAmount(i);
    if (i.status === "paid" || remaining <= 0) {
      paid.push(i);
      continue;
    }
  }
  for (const i of dedupeOpenInstallments(installments)) {
    // Defense: dedupe already Path-A filters; keep table «مانده‌ها/معوق» aligned.
    const kind = effectiveImportKind(i);
    if (kind && !isOpenDebtKind(kind)) continue;
    if (i.status === "overdue") overdue.push(i);
    else open.push(i);
  }
  const bySeq = (a: Installment, b: Installment) => a.seq - b.seq || a.dueDate.localeCompare(b.dueDate);
  paid.sort(bySeq);
  open.sort(bySeq);
  overdue.sort(bySeq);
  const lastPaid = paid.length ? paid[paid.length - 1] : undefined;
  return {
    paidCount: paid.length,
    totalOpenOrPaid: paid.length + open.length + overdue.length,
    lastPaid,
    paid,
    open,
    overdue,
    history,
  };
}

/** Same-day / +1 / +3 / +7 / +30 filters are a later PR. This dossier uses three buckets. */
export const RENEWAL_NEAR_DAYS = 45;

export type RenewalBucket = "missed" | "near" | "far";

export const RENEWAL_BUCKET_LABEL: Record<RenewalBucket, string> = {
  missed: "از دست‌رفته / منقضی",
  near: "نزدیک (۴۵ روز)",
  far: "دورتر",
};

export function renewalBucket(endDate: string, today: Date): RenewalBucket | null {
  const days = relativeDays(endDate, today);
  if (!Number.isFinite(days)) return null;
  if (days < 0) return "missed";
  if (days <= RENEWAL_NEAR_DAYS) return "near";
  return "far";
}

export function bucketPolicies(policies: Policy[], today: Date) {
  const missed: Policy[] = [];
  const near: Policy[] = [];
  const far: Policy[] = [];
  for (const p of policies) {
    const bucket = renewalBucket(p.endDate, today);
    if (bucket === "missed") missed.push(p);
    else if (bucket === "near") near.push(p);
    else if (bucket === "far") far.push(p);
  }
  return { missed, near, far };
}

export function dossierCustomerId(args: {
  customerId?: string | null;
  policyId?: string | null;
  policies?: Policy[];
}): string | undefined {
  const direct = (args.customerId ?? "").trim();
  if (direct) return direct;
  const policyId = (args.policyId ?? "").trim();
  if (!policyId || !args.policies) return undefined;
  const linked = args.policies.find((p) => p.id === policyId)?.customerId?.trim();
  return linked || undefined;
}

export function policyDisplayNumber(policy: {
  number?: string | null;
  computerCode?: string | null;
  id?: string | null;
}): string {
  const number = (policy.number ?? "").trim();
  if (number) return number;
  const code = (policy.computerCode ?? "").trim();
  if (code) return code;
  return (policy.id ?? "").trim();
}

export function matchesDossierQuery(
  query: string,
  fields: Array<string | undefined | null>,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => (f ?? "").toLowerCase().includes(q));
}

export type CrmSearchHit = {
  customerId: string;
  title: string;
  subtitle: string;
  kind: "customer" | "policy";
};

export function searchCrmDossierHits(
  query: string,
  customers: Array<{
    id: string;
    fullName: string;
    nationalId?: string;
    legalEntityId?: string;
    phone?: string;
    city?: string;
  }>,
  policies: Array<{
    id: string;
    number?: string;
    computerCode?: string;
    customerId: string;
    kind?: string;
    holderName?: string;
  }>,
  limit = 8,
): CrmSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: CrmSearchHit[] = [];
  for (const c of customers) {
    if (matchesDossierQuery(q, [c.fullName, c.nationalId, c.legalEntityId, c.phone, c.city, c.id])) {
      hits.push({
        customerId: c.id,
        title: c.fullName,
        subtitle: [c.nationalId, c.phone].filter(Boolean).join(" · ") || "بیمه‌گذار",
        kind: "customer",
      });
    }
    if (hits.length >= limit) return hits;
  }
  const byId = new Map(customers.map((c) => [c.id, c]));
  for (const p of policies) {
    if (!p.customerId) continue;
    const label = policyDisplayNumber(p);
    if (matchesDossierQuery(q, [label, p.computerCode, p.kind, p.holderName, p.number, p.id])) {
      const holder = byId.get(p.customerId);
      hits.push({
        customerId: p.customerId,
        title: label || p.id,
        subtitle: holder?.fullName || p.holderName || p.kind || "بیمه‌نامه",
        kind: "policy",
      });
    }
    if (hits.length >= limit) return hits;
  }
  return hits;
}
