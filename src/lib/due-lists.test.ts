import { describe, expect, test } from "bun:test";
import type { ApiInstallment, ApiPolicy } from "./api";
import {
  DUE_LIST_LIMIT,
  RENEWAL_WINDOW_DAYS,
  installmentRows,
  mapDueInstallment,
  mapRenewalPolicy,
  renewalRows,
  shouldUseSlimFeed,
  type FeedInstallment,
  type FeedPolicy,
} from "./due-lists";
import type { Installment, Policy } from "./types";

const TODAY = new Date("2025-07-01T00:00:00.000Z"); // ۱۴۰۴/۰۴/۱۰

function installment(patch: Partial<FeedInstallment>): FeedInstallment {
  return {
    id: "I-1",
    policyId: "P-1",
    customerId: "C-0011748206",
    seq: 1,
    amount: 1_000_000,
    paidAmount: 0,
    dueDate: "1404/04/19",
    status: "due",
    payments: [],
    ...patch,
  } satisfies Installment as FeedInstallment;
}

function policy(patch: Partial<FeedPolicy>): FeedPolicy {
  return {
    id: "P-1",
    number: "1404/100201",
    customerId: "C-0011748206",
    kind: "درمان تکمیلی",
    company: "بیمه کارآفرین",
    premium: 12_000_000,
    startDate: "1403/04/19",
    endDate: "1404/04/19",
    status: "active",
    installmentCount: 1,
    ...patch,
  } satisfies Policy as FeedPolicy;
}

describe("shouldUseSlimFeed", () => {
  test("fetches the slim endpoint only while the full store rows are missing", () => {
    expect(shouldUseSlimFeed(0, "pending")).toBe(true);
    expect(shouldUseSlimFeed(0, "error")).toBe(true);
    expect(shouldUseSlimFeed(0, "live")).toBe(true);
    expect(shouldUseSlimFeed(12, "pending")).toBe(false);
    expect(shouldUseSlimFeed(12, "live")).toBe(false);
  });

  test("never overrides the demo/mock seed", () => {
    expect(shouldUseSlimFeed(0, "mock")).toBe(false);
  });
});

describe("installmentRows", () => {
  test("keeps only سررسید/معوق and orders live Jalali due dates oldest first", () => {
    const rows = installmentRows({
      installments: [
        installment({ id: "I-due", dueDate: "1404/04/19", status: "due" }),
        installment({ id: "I-paid", dueDate: "1403/10/01", status: "paid" }),
        installment({ id: "I-overdue", dueDate: "1404/01/01", status: "overdue" }),
        installment({ id: "I-partial", dueDate: "1404/02/01", status: "partial" }),
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(["I-overdue", "I-due"]);
    expect(rows[0].dueDate).toBe("1404/01/01");
  });

  test("undated rows stay in the list instead of breaking the sort", () => {
    const rows = installmentRows({
      installments: [
        installment({ id: "I-empty", dueDate: "", status: "overdue" }),
        installment({ id: "I-dated", dueDate: "1404/04/19", status: "due" }),
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(["I-dated", "I-empty"]);
  });

  test("uses the joined slim name/number, then falls back to store lookups", () => {
    const [joined] = installmentRows({
      installments: [
        installment({ customerName: "فاطمه محمدی", policyNumber: "1404/100201", status: "due" }),
      ],
    });
    expect(joined.customerName).toBe("فاطمه محمدی");
    expect(joined.policyLabel).toBe("1404/100201");

    const [fromStore] = installmentRows({
      installments: [installment({ status: "due" })],
      customers: [{ id: "C-0011748206", fullName: "فاطمه محمدی" }],
      policies: [policy({})],
    });
    expect(fromStore.customerName).toBe("فاطمه محمدی");
    expect(fromStore.policyLabel).toBe("1404/100201");
  });

  test("resolves the dossier link through the policy when the row has no customer", () => {
    const [row] = installmentRows({
      installments: [installment({ customerId: "", status: "overdue", dueDate: "1404/01/01" })],
      policies: [policy({})],
    });
    expect(row.customerId).toBe("C-0011748206");
  });

  test("caps the table at the shared row limit", () => {
    const many = Array.from({ length: DUE_LIST_LIMIT + 5 }, (_, i) =>
      installment({ id: `I-${i}`, status: "overdue", dueDate: "1404/01/01" }),
    );
    expect(installmentRows({ installments: many })).toHaveLength(DUE_LIST_LIMIT);
  });
});

describe("renewalRows", () => {
  test("keeps active policies inside the 45-day Jalali window", () => {
    const rows = renewalRows({
      policies: [
        policy({ id: "P-soon", endDate: "1404/04/19" }),
        policy({ id: "P-today", endDate: "1404/04/10" }),
        policy({ id: "P-expired-window", endDate: "1404/04/09" }),
        policy({ id: "P-far", endDate: "1405/03/01" }),
        policy({ id: "P-cancelled", endDate: "1404/04/15", status: "cancelled" }),
        policy({ id: "P-undated", endDate: "" }),
      ],
      today: TODAY,
    });
    expect(rows.map((r) => r.id)).toEqual(["P-today", "P-soon"]);
    expect(rows[1].daysLeft).toBe(9);
  });

  test("honours the last day of the window and excludes the day after", () => {
    const rows = renewalRows({
      policies: [
        policy({ id: "P-last", endDate: "1404/05/24" }),
        policy({ id: "P-past-window", endDate: "1404/05/25" }),
      ],
      today: TODAY,
      withinDays: RENEWAL_WINDOW_DAYS,
    });
    expect(rows.map((r) => r.id)).toEqual(["P-last"]);
  });

  test("still works for Gregorian ISO endDate rows from demo data", () => {
    const rows = renewalRows({
      policies: [policy({ id: "P-iso", endDate: "2025-07-20" })],
      today: TODAY,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].daysLeft).toBe(19);
  });

  test("prefers the joined holder name and falls back to the store", () => {
    const [joined] = renewalRows({
      policies: [policy({ customerName: "فاطمه محمدی" })],
      today: TODAY,
    });
    expect(joined.customerName).toBe("فاطمه محمدی");

    const [fromStore] = renewalRows({
      policies: [policy({})],
      customers: [{ id: "C-0011748206", fullName: "فاطمه محمدی" }],
      today: TODAY,
    });
    expect(fromStore.customerName).toBe("فاطمه محمدی");
  });

  test("trustApiWindow keeps API-in-window Jalali endDate when client today is one UTC day ahead of asOf", () => {
    // API asOf 2026-09-16 → daysLeft 0 for 1405/06/25; Tehran client can already be 2026-09-17.
    const apiAsOf = new Date("2026-09-16T00:00:00.000Z");
    const clientToday = new Date("2026-09-17T00:00:00.000Z");
    const row = policy({ id: "P-asof-edge", endDate: "1405/06/25", daysLeft: 0 });

    expect(renewalRows({ policies: [row], today: apiAsOf })).toHaveLength(1);
    expect(renewalRows({ policies: [row], today: clientToday })).toHaveLength(0);
    const trusted = renewalRows({
      policies: [row],
      today: clientToday,
      trustApiWindow: true,
    });
    expect(trusted).toHaveLength(1);
    expect(trusted[0].id).toBe("P-asof-edge");
    expect(trusted[0].daysLeft).toBe(0); // prefer API daysLeft threaded on FeedPolicy
  });
});

describe("slim wire mappers", () => {
  test("mapDueInstallment derives status from the live Jalali dueDate", () => {
    const wire: ApiInstallment = {
      id: "I-1",
      policyId: "P-1",
      customerId: "C-0011748206",
      seq: 2,
      amount: 1_000_000,
      paidAmount: 0,
      dueDate: "1404/01/01",
      status: "overdue",
      holder_code: "88012",
      customerName: "فاطمه محمدی",
      policyNumber: "1404/100201",
    };
    const row = mapDueInstallment(wire, 0, TODAY);
    expect(row.status).toBe("overdue");
    expect(row.holderCode).toBe("88012");
    expect(row.customerName).toBe("فاطمه محمدی");
    expect(row.payments).toEqual([]);
  });

  test("mapRenewalPolicy keeps endDate text and the joined holder name", () => {
    const wire: ApiPolicy = {
      id: "P-1",
      number: "1404/100201",
      customerId: "C-0011748206",
      kind: "اتومبیل",
      company: "بیمه کارآفرین",
      premium: 12_000_000,
      endDate: "1404/04/19",
      status: "active",
      holder_code: "88012",
      customerName: "فاطمه محمدی",
    };
    const row = mapRenewalPolicy(wire, 0);
    expect(row.endDate).toBe("1404/04/19");
    expect(row.kind).toBe("شخص ثالث");
    expect(row.holderCode).toBe("88012");
    expect(row.customerName).toBe("فاطمه محمدی");
    expect(renewalRows({ policies: [row], today: TODAY })).toHaveLength(1);
  });
});
