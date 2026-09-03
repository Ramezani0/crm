import type { Customer, CustomerStatus, Installment, InstallmentStatus, Policy, PolicyStatus } from "./types";
import { buildDemoData, type DemoData } from "./demo-data";

type ApiCustomer = {
  id: string;
  fullName?: string;
  nationalId?: string;
  phone?: string;
  email?: string;
  city?: string;
  status?: string;
  statusLabel?: string;
  segment?: string;
  agent?: string;
  createdAt?: string;
  note?: string;
};

type ApiPolicy = {
  id: string;
  number?: string;
  customerId?: string;
  holderName?: string;
  kind?: string;
  kindRaw?: string;
  company?: string;
  premium?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  statusLabel?: string;
  installmentCount?: number;
};

type ApiInstallment = {
  id: string;
  policyId?: string;
  customerId?: string;
  holderName?: string;
  seq?: number;
  amount?: number;
  paidAmount?: number;
  dueDate?: string;
  status?: string;
  statusLabel?: string;
  payments?: { id: string; amount: number; date: string; method: string; by: string }[];
};

type ApiPayload = {
  customers?: ApiCustomer[];
  policies?: ApiPolicy[];
  installments?: ApiInstallment[];
};

const CUSTOMER_STATUS: Record<string, CustomerStatus> = {
  active: "active",
  inactive: "inactive",
  lead: "lead",
};

const POLICY_STATUS: Record<string, PolicyStatus> = {
  active: "active",
  expired: "expired",
  pending: "pending",
  cancelled: "cancelled",
};

const INSTALLMENT_STATUS: Record<string, InstallmentStatus> = {
  paid: "paid",
  due: "due",
  overdue: "overdue",
  partial: "partial",
};

function mapCustomer(c: ApiCustomer): Customer {
  const segment = c.segment === "حقوقی" ? "حقوقی" : "حقیقی";
  return {
    id: c.id,
    fullName: c.fullName ?? "",
    nationalId: c.nationalId ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    city: c.city ?? "",
    status: CUSTOMER_STATUS[c.status ?? ""] ?? "active",
    statusLabel: c.statusLabel?.trim() || undefined,
    segment,
    agent: c.agent ?? "",
    createdAt: c.createdAt || new Date().toISOString(),
    note: c.note || undefined,
  };
}

function mapPolicy(p: ApiPolicy): Policy {
  // Keep raw insurance kind from file/DB — never remap سواری/بارکش → عمر.
  const kind = (p.kindRaw || p.kind || "").trim() || "—";
  return {
    id: p.id,
    number: p.number ?? "",
    customerId: p.customerId ?? "",
    holderName: p.holderName?.trim() || undefined,
    kind,
    company: p.company ?? "",
    premium: Number(p.premium) || 0,
    startDate: p.startDate ?? "",
    endDate: p.endDate ?? "",
    status: POLICY_STATUS[p.status ?? ""] ?? "active",
    statusLabel: p.statusLabel?.trim() || undefined,
    installmentCount: Number(p.installmentCount) || 0,
  };
}

function mapInstallment(i: ApiInstallment): Installment {
  return {
    id: i.id,
    policyId: i.policyId ?? "",
    customerId: i.customerId ?? "",
    holderName: i.holderName?.trim() || undefined,
    seq: Number(i.seq) || 0,
    amount: Number(i.amount) || 0,
    paidAmount: Number(i.paidAmount) || 0,
    dueDate: i.dueDate ?? "",
    status: INSTALLMENT_STATUS[i.status ?? ""] ?? "due",
    statusLabel: i.statusLabel?.trim() || undefined,
    payments: Array.isArray(i.payments) ? i.payments : [],
  };
}

/** Fetch live VPS data; fall back to demo seed only if API is unreachable. */
export async function loadCrmData(signal?: AbortSignal): Promise<{ data: DemoData; source: "api" | "demo" }> {
  const demo = buildDemoData();
  try {
    const res = await fetch("/api/data", {
      signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = (await res.json()) as ApiPayload;
    const customers = (payload.customers ?? []).map(mapCustomer);
    const policies = (payload.policies ?? []).map(mapPolicy);
    const installments = (payload.installments ?? []).map(mapInstallment);
    if (!customers.length && !policies.length) throw new Error("empty payload");
    return {
      source: "api",
      data: {
        ...demo,
        customers,
        policies,
        installments,
      },
    };
  } catch {
    return { source: "demo", data: demo };
  }
}
