/** M1 Sales Network — client types + API helpers. DEMO_DEFAULTS mirror vps/sales_network.py */

import { apiFetch, apiUrl } from "./api";

export type SalesAgentRole =
  | "general"
  | "ayeen96"
  | "broker"
  | "development_manager"
  | "marketer";

export type CommissionKind = "issuance" | "collection" | "supervisory";

export type SalesAgent = {
  id: number;
  code: string;
  fullName: string;
  parentId: number | null;
  role: SalesAgentRole | string;
  roleLabel: string;
  active: boolean;
  phone: string;
  nationalId: string;
  notes: string;
  createdAt: string;
  children?: SalesAgent[];
};

export type CommissionRule = {
  id: number | null;
  kind: CommissionKind | string;
  kindLabel: string;
  policyYear: number;
  ratePct: number;
  withholdingTaxPct: number | null;
  notes: string;
  active: boolean;
  demoDefaults?: boolean;
};

export type CommissionSplit = {
  agentId: number;
  agentCode: string;
  agentName: string;
  role: string;
  roleLabel: string;
  kind: CommissionKind | string;
  kindLabel: string;
  depth: number | null;
  ratePct: number;
  grossRial: number;
  withholdingTaxPct: number;
  taxRial: number;
  netRial: number;
};

export type CommissionPreview = {
  ok: boolean;
  error?: string;
  premiumRial?: number;
  policyYear?: number;
  agentId?: number;
  splits?: CommissionSplit[];
  totals?: { grossRial: number; taxRial: number; netRial: number };
  withholdingTaxPct?: number;
  demoDefaults?: boolean;
  disclaimer?: string;
};

/** DEMO_DEFAULTS — NOT legal rates. Keep in sync with vps/sales_network.py */
export const DEMO_ISSUANCE_PCT: Record<number, number> = {
  1: 20,
  2: 15,
  3: 12,
  4: 10,
  5: 8,
};
export const DEMO_COLLECTION_PCT: Record<number, number> = {
  1: 5,
  2: 4,
  3: 3,
  4: 2,
  5: 1,
};
export const DEMO_SUPERVISORY_PCT: Record<number, number> = {
  1: 2,
  2: 1,
  3: 0.5,
  4: 0.25,
  5: 0.1,
};
export const DEMO_WITHHOLDING_TAX_PCT = 10;

export function roundRial(value: number): number {
  return Math.round(value);
}

/** Local preview math (fallback / unit tests) — same DEMO_DEFAULTS as backend. */
export function previewCommissionLocal(input: {
  premiumRial: number;
  policyYear: number;
  agentId: number;
  agents: SalesAgent[];
  withholdingTaxPct?: number;
}): CommissionPreview {
  const { premiumRial, policyYear, agentId, agents } = input;
  if (!(premiumRial >= 0) || !Number.isFinite(premiumRial)) {
    return { ok: false, error: "حق بیمه نامعتبر است" };
  }
  if (policyYear < 1 || policyYear > 5) {
    return { ok: false, error: "سال بیمه‌نامه باید ۱ تا ۵ باشد" };
  }
  const byId = new Map(agents.map((a) => [a.id, a]));
  const seller = byId.get(agentId);
  if (!seller) return { ok: false, error: "نماینده یافت نشد" };

  const taxPct = input.withholdingTaxPct ?? DEMO_WITHHOLDING_TAX_PCT;
  const splits: CommissionSplit[] = [];

  const push = (
    agent: SalesAgent,
    kind: CommissionKind,
    kindLabel: string,
    ratePct: number,
    depth: number | null,
  ) => {
    const grossRial = roundRial(premiumRial * (ratePct / 100));
    const taxRial = roundRial(grossRial * (taxPct / 100));
    splits.push({
      agentId: agent.id,
      agentCode: agent.code,
      agentName: agent.fullName,
      role: agent.role,
      roleLabel: agent.roleLabel,
      kind,
      kindLabel,
      depth,
      ratePct,
      grossRial,
      withholdingTaxPct: taxPct,
      taxRial,
      netRial: grossRial - taxRial,
    });
  };

  push(seller, "issuance", "صدور", DEMO_ISSUANCE_PCT[policyYear] ?? 0, 0);
  push(seller, "collection", "وصول", DEMO_COLLECTION_PCT[policyYear] ?? 0, 0);

  let depth = 1;
  let parentId = seller.parentId;
  const seen = new Set<number>([agentId]);
  while (parentId != null && depth <= 5) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const ancestor = byId.get(parentId);
    if (!ancestor) break;
    const rate = DEMO_SUPERVISORY_PCT[depth] ?? 0;
    if (rate > 0) push(ancestor, "supervisory", "نظارتی", rate, depth);
    parentId = ancestor.parentId;
    depth += 1;
  }

  const grossRial = splits.reduce((s, x) => s + x.grossRial, 0);
  const taxRial = splits.reduce((s, x) => s + x.taxRial, 0);
  return {
    ok: true,
    premiumRial: roundRial(premiumRial),
    policyYear,
    agentId,
    splits,
    totals: { grossRial, taxRial, netRial: grossRial - taxRial },
    withholdingTaxPct: taxPct,
    demoDefaults: true,
    disclaimer: "DEMO_DEFAULTS — نرخ‌های نمونه؛ مبنای حقوقی نیستند.",
  };
}

async function snFetch<T>(path: `/api/sales-network/${string}`, init?: RequestInit): Promise<T> {
  const res = await apiFetch(apiUrl(path), {
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...init,
  });
  return (await res.json()) as T;
}

export async function fetchSalesAgents(): Promise<{
  ok: boolean;
  items: SalesAgent[];
  roles?: { id: string; label: string }[];
  error?: string;
}> {
  try {
    return await snFetch("/api/sales-network/agents");
  } catch {
    return { ok: false, items: [], error: "ارتباط با API برقرار نشد" };
  }
}

export async function fetchSalesTree(): Promise<{
  ok: boolean;
  tree: SalesAgent[];
  stats?: {
    totalAgents: number;
    activeAgents: number;
    inactiveAgents: number;
    roots: number;
  };
  error?: string;
}> {
  try {
    return await snFetch("/api/sales-network/tree");
  } catch {
    return { ok: false, tree: [], error: "ارتباط با API برقرار نشد" };
  }
}

export async function fetchCommissionRules(): Promise<{
  ok: boolean;
  items: CommissionRule[];
  withholdingTaxPct?: number;
  disclaimer?: string;
  error?: string;
}> {
  try {
    return await snFetch("/api/sales-network/commission-rules");
  } catch {
    return { ok: false, items: [], error: "ارتباط با API برقرار نشد" };
  }
}

export async function createSalesAgent(body: Record<string, unknown>) {
  return snFetch<{ ok: boolean; item?: SalesAgent; error?: string }>("/api/sales-network/agents", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchSalesAgent(id: number, body: Record<string, unknown>) {
  return snFetch<{ ok: boolean; item?: SalesAgent; error?: string }>(
    `/api/sales-network/agents/${id}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export async function previewCommissionApi(body: {
  premiumRial: number;
  policyYear: number;
  agentId: number;
}): Promise<CommissionPreview> {
  try {
    return await snFetch("/api/sales-network/commission/preview", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "ارتباط با API برقرار نشد" };
  }
}

export function flattenAgents(nodes: SalesAgent[]): SalesAgent[] {
  const out: SalesAgent[] = [];
  const walk = (list: SalesAgent[]) => {
    for (const n of list) {
      const { children: _c, ...rest } = n;
      out.push(rest as SalesAgent);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
