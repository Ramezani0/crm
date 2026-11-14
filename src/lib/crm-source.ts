import { toFa } from "./format";
import type { FetchSource, HealthCounts } from "./api";

export type CrmSource = FetchSource | "pending" | "error";

export function crmPageSubtitle(
  source: CrmSource,
  opts?: { fullError?: boolean; summaryOnly?: boolean },
): string {
  if (source === "pending") return "در حال خواندن فهرست …";
  if (source === "error") return "خطا در خواندن /api/data";
  if (source === "live" && opts?.fullError) {
    return "KPI از /api/data/summary — بارگذاری کامل ناموفق؛ دوباره تلاش کنید";
  }
  if (source === "live" && opts?.summaryOnly) {
    return "KPI اولیه از /api/data/summary — در حال بارگذاری کامل";
  }
  if (source === "live") return "داده زنده از /api/data";
  return "داده نمایشی — /api/data در دسترس نیست";
}

export function crmSourceCaption(source: CrmSource, count: number, noun: string): string {
  if (source === "pending") return "در حال بارگذاری فهرست …";
  if (source === "error") return "بارگذاری /api/data ناموفق بود — دوباره تلاش کنید";
  const n = toFa(count);
  if (source === "live") return `${n} ${noun} از /api/data`;
  return `${n} ${noun} — داده نمایشی (API در دسترس نیست)`;
}

/**
 * First-paint KPIs: prefer array lengths once full `/api/data` hydrated;
 * otherwise use summary `counts` (customers/policies/installments).
 * Summary has no policies/installments arrays — only counts.
 */
export function resolveKpiCounts(
  arrays: { customers: number; policies: number; installments: number },
  summary: HealthCounts | null | undefined,
): HealthCounts {
  return {
    customers: arrays.customers > 0 ? arrays.customers : (summary?.customers ?? 0),
    policies: arrays.policies > 0 ? arrays.policies : (summary?.policies ?? 0),
    installments: arrays.installments > 0 ? arrays.installments : (summary?.installments ?? 0),
  };
}

export function hasKpiFirstPaint(counts: HealthCounts): boolean {
  return counts.customers > 0 || counts.policies > 0 || counts.installments > 0;
}
