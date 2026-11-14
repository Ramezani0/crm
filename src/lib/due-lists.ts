import type { ApiInstallment, ApiPolicy } from "./api";
import type { CrmSource } from "./crm-source";
import { dossierCustomerId, overdueDays, policyDisplayNumber, remainingAmount } from "./dossier";
import { compareDateStrings, isInRenewalWindow, relativeDays } from "./format";
import { mapInstallment, mapPolicy } from "./map-api-data";
import type { Customer, Installment, InstallmentStatus, Policy, PolicyStatus } from "./types";

/** `/renewals` window and the row cap both pages render. */
export const RENEWAL_WINDOW_DAYS = 45;
export const DUE_LIST_LIMIT = 12;

/** اقساط lists سررسید + معوق only — the same pair `/api/installments` defaults to. */
const DUE_STATUSES = new Set<InstallmentStatus>(["overdue", "due"]);

/** Slim rows carry the joined holder name so the page needs no customers dump. */
export type FeedInstallment = Installment & { customerName?: string; policyNumber?: string };
export type FeedPolicy = Policy & { customerName?: string; daysLeft?: number };

export type InstallmentRow = {
  id: string;
  customerId: string;
  customerName: string;
  policyId: string;
  policyLabel: string;
  seq: number;
  amount: number;
  remaining: number;
  dueDate: string;
  status: InstallmentStatus;
  daysOverdue: number;
};

export type RenewalRow = {
  id: string;
  customerId: string;
  customerName: string;
  policyLabel: string;
  kind: string;
  premium: number;
  endDate: string;
  daysLeft: number;
  status: PolicyStatus;
};

/**
 * Pages fall back to `/api/installments` / `/api/renewals` when the full `/api/data`
 * store rows are still empty. Demo/mock data already fills the store, so it wins.
 */
export function shouldUseSlimFeed(storeRowCount: number, source: CrmSource): boolean {
  return storeRowCount === 0 && source !== "mock";
}

export function mapDueInstallment(row: ApiInstallment, index: number, asOf: Date): FeedInstallment {
  return {
    ...mapInstallment(row, index, asOf),
    customerName: (row.customerName ?? "").trim(),
    policyNumber: (row.policyNumber ?? "").trim(),
  };
}

export function mapRenewalPolicy(row: ApiPolicy, index: number): FeedPolicy {
  const daysLeft = typeof row.daysLeft === "number" && Number.isFinite(row.daysLeft) ? row.daysLeft : undefined;
  return {
    ...mapPolicy(row, index),
    customerName: (row.customerName ?? "").trim(),
    daysLeft,
  };
}

type NamedCustomer = Pick<Customer, "id" | "fullName">;

function nameOf(customers: NamedCustomer[], customerId: string, fallback?: string): string {
  const joined = (fallback ?? "").trim();
  if (joined) return joined;
  const id = (customerId ?? "").trim();
  if (!id) return "";
  return customers.find((c) => c.id === id)?.fullName ?? "";
}

/** سررسید/معوق rows for `/installments`, oldest due date first. HIST excluded. */
export function installmentRows(args: {
  installments: FeedInstallment[];
  customers?: NamedCustomer[];
  policies?: Policy[];
  limit?: number;
  today?: Date;
}): InstallmentRow[] {
  const { installments, customers = [], policies = [], limit = DUE_LIST_LIMIT, today = new Date() } = args;
  return installments
    .filter((i) => DUE_STATUSES.has(i.status) && remainingAmount(i) > 0)
    .sort((a, b) => compareDateStrings(a.dueDate, b.dueDate))
    .slice(0, limit)
    .map((i) => {
      const policy = policies.find((p) => p.id === i.policyId);
      const label =
        (i.policyNumber ?? "").trim() ||
        (policy ? policyDisplayNumber(policy) : "") ||
        (i.computerCode ?? "").trim() ||
        i.policyId;
      const days = overdueDays(i, today);
      return {
        id: i.id,
        customerId:
          dossierCustomerId({ customerId: i.customerId, policyId: i.policyId, policies }) ?? "",
        customerName: nameOf(customers, i.customerId, i.customerName),
        policyId: i.policyId,
        policyLabel: label,
        seq: i.seq,
        amount: i.amount,
        remaining: remainingAmount(i),
        dueDate: i.dueDate,
        status: i.status,
        daysOverdue: Number.isFinite(days) ? days : Number.NaN,
      };
    });
}

/** Active policies expiring inside the window, soonest first. Same rule as the API.
 * When `trustApiWindow` is set (slim `/api/renewals` already filtered by server `asOf`),
 * skip the client 0..withinDays re-check so Asia/Tehran calendar skew cannot drop rows.
 */
export function renewalRows(args: {
  policies: FeedPolicy[];
  customers?: NamedCustomer[];
  today: Date;
  withinDays?: number;
  limit?: number;
  /** Trust the slim API window; still require active status. */
  trustApiWindow?: boolean;
}): RenewalRow[] {
  const {
    policies,
    customers = [],
    today,
    withinDays = RENEWAL_WINDOW_DAYS,
    limit = DUE_LIST_LIMIT,
    trustApiWindow = false,
  } = args;
  return policies
    .filter((p) => {
      if (p.status !== "active") return false;
      if (trustApiWindow) return true;
      return isInRenewalWindow(p.endDate, today, withinDays);
    })
    .sort((a, b) => compareDateStrings(a.endDate, b.endDate))
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      customerId: (p.customerId ?? "").trim(),
      customerName: nameOf(customers, p.customerId, p.customerName),
      policyLabel: policyDisplayNumber(p),
      kind: p.kind,
      premium: typeof p.premium === "number" && Number.isFinite(p.premium) ? p.premium : 0,
      endDate: p.endDate,
      daysLeft:
        typeof p.daysLeft === "number" && Number.isFinite(p.daysLeft)
          ? p.daysLeft
          : relativeDays(p.endDate, today),
      status: p.status,
    }));
}
