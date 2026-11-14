import { describe, expect, test } from "bun:test";
import {
  crmPageSubtitle,
  crmSourceCaption,
  hasKpiFirstPaint,
  resolveKpiCounts,
} from "./crm-source";

describe("crmPageSubtitle", () => {
  test("pending is the loading copy, error is not stuck loading", () => {
    expect(crmPageSubtitle("pending")).toContain("در حال خواندن");
    expect(crmPageSubtitle("pending")).not.toContain("/api/data");
    expect(crmPageSubtitle("error")).toContain("خطا");
    expect(crmPageSubtitle("error")).not.toContain("در حال خواندن");
  });

  test("live + fullError mentions summary KPI and retry", () => {
    const s = crmPageSubtitle("live", { fullError: true });
    expect(s).toContain("/api/data/summary");
    expect(s).toContain("دوباره تلاش");
  });

  test("live + summaryOnly mentions first-paint summary", () => {
    const s = crmPageSubtitle("live", { summaryOnly: true });
    expect(s).toContain("/api/data/summary");
    expect(s).toContain("بارگذاری کامل");
  });
});

describe("crmSourceCaption", () => {
  test("error caption asks to retry", () => {
    expect(crmSourceCaption("error", 0, "مشتری")).toContain("دوباره تلاش");
  });
});

describe("resolveKpiCounts", () => {
  test("uses summary counts when arrays are still empty (first paint)", () => {
    const counts = resolveKpiCounts(
      { customers: 0, policies: 0, installments: 0 },
      { customers: 2489, policies: 9052, installments: 29457 },
    );
    expect(counts).toEqual({ customers: 2489, policies: 9052, installments: 29457 });
    expect(hasKpiFirstPaint(counts)).toBe(true);
  });

  test("prefers array lengths once full /api/data hydrated", () => {
    const counts = resolveKpiCounts(
      { customers: 10, policies: 20, installments: 30 },
      { customers: 2489, policies: 9052, installments: 29457 },
    );
    expect(counts).toEqual({ customers: 10, policies: 20, installments: 30 });
  });

  test("empty arrays + no summary → zeros / no first paint", () => {
    const counts = resolveKpiCounts({ customers: 0, policies: 0, installments: 0 }, null);
    expect(counts).toEqual({ customers: 0, policies: 0, installments: 0 });
    expect(hasKpiFirstPaint(counts)).toBe(false);
  });

  test("customers array from summary list + policy/installment from counts", () => {
    const counts = resolveKpiCounts(
      { customers: 2489, policies: 0, installments: 0 },
      { customers: 2489, policies: 9052, installments: 29457 },
    );
    expect(counts.customers).toBe(2489);
    expect(counts.policies).toBe(9052);
    expect(counts.installments).toBe(29457);
  });
});
