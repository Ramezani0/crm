import { describe, expect, test } from "bun:test";
import {
  bucketPolicies,
  debtCaption,
  dedupeOpenInstallments,
  dossierCustomerId,
  findCustomerByParam,
  dossierHolderCodes,
  isHistoryInstallment,
  inferImportKindFromId,
  isOpenDebtKind,
  matchesDossierQuery,
  openDebtDedupeKey,
  overdueDays,
  partitionInstallments,
  policyKeyFromInstallment,
  policyDisplayNumber,
  relatedInstallments,
  relatedPolicies,
  remainingAmount,
  renewalBucket,
  searchCrmDossierHits,
  summarizeDebt,
} from "./dossier";
import type { Installment, Policy } from "./types";

const policy = (id: string, customerId: string): Policy => ({
  id,
  number: id,
  customerId,
  kind: "شخص ثالث",
  company: "بیمه کارآفرین",
  premium: 10,
  startDate: "2026-01-01",
  endDate: "2027-01-01",
  status: "active",
  installmentCount: 1,
});

const inst = (
  id: string,
  patch: Partial<Installment> & Pick<Installment, "customerId" | "policyId" | "status">,
): Installment => ({
  id,
  seq: 1,
  amount: 100,
  paidAmount: 0,
  dueDate: "2026-01-01",
  payments: [],
  ...patch,
});

describe("relatedPolicies", () => {
  test("keeps only the requested customer", () => {
    const rows = [policy("P-1", "C-1"), policy("P-2", "C-2")];
    expect(relatedPolicies(rows, "C-1").map((p) => p.id)).toEqual(["P-1"]);
  });

  test("matches C- prefix aliases from national id", () => {
    const rows = [policy("P-1", "C-0011748206")];
    expect(
      relatedPolicies(rows, "C-0011748206", { id: "C-0011748206", nationalId: "0011748206" }).map(
        (p) => p.id,
      ),
    ).toEqual(["P-1"]);
  });
});

describe("relatedInstallments", () => {
  test("includes rows linked by customerId or by policy id", () => {
    const rows = [
      inst("I-1", { customerId: "C-1", policyId: "P-1", status: "overdue" }),
      inst("I-2", { customerId: "", policyId: "P-1", status: "due" }),
      inst("I-3", { customerId: "C-9", policyId: "P-9", status: "due" }),
    ];
    const related = relatedInstallments(rows, "C-1", new Set(["P-1"]));
    expect(related.map((i) => i.id)).toEqual(["I-1", "I-2"]);
  });
});

describe("summarizeDebt", () => {
  test("sums overdue and unpaid remaining amounts", () => {
    const summary = summarizeDebt([
      inst("a", {
        customerId: "C-1",
        policyId: "P-1",
        status: "overdue",
        amount: 100,
        paidAmount: 10,
        dueDate: "2026-01-01",
        seq: 1,
      }),
      inst("b", {
        customerId: "C-1",
        policyId: "P-1",
        status: "due",
        amount: 50,
        paidAmount: 0,
        dueDate: "2026-06-01",
        seq: 2,
      }),
      inst("c", {
        customerId: "C-1",
        policyId: "P-1",
        status: "paid",
        amount: 20,
        paidAmount: 20,
        dueDate: "2025-12-01",
        seq: 3,
      }),
    ]);
    expect(summary.overdueCount).toBe(1);
    expect(summary.unpaidCount).toBe(2);
    expect(summary.overdueBalance).toBe(90);
    expect(summary.unpaidBalance).toBe(140);
    expect(summary.paidTotal).toBe(30);
    expect(summary.approximate).toBe(false);
  });

  test("marks live-shaped unpaid rows as approximate when no payments exist", () => {
    const summary = summarizeDebt([
      inst("a", { customerId: "C-1", policyId: "P-1", status: "overdue", amount: 80, paidAmount: 0 }),
    ]);
    expect(summary.approximate).toBe(true);
    expect(debtCaption(summary)).toContain("تقریبی");
  });

  test("excludes HIST/history from overdue and unpaid (Amir 1838500 shape)", () => {
    // LIVE DB shape (VERIFY PRECHECK): collection_detail unpaid empty;
    // delay_700 due_date empty; unpaid_due carries gold Σ 314237812 / 4.
    const rows: Installment[] = [
      inst("I-HIST-universal_life-1", {
        customerId: "1838500",
        policyId: "P-ul",
        status: "history",
        amount: 1_237_464_000,
        paidAmount: 0,
        kind: "HIST:universal_life",
      }),
      inst("I-HIST-tp-1", {
        customerId: "1838500",
        policyId: "P-tp",
        status: "overdue", // coerced by old API
        statusLabel: "history",
        amount: 50_000_000,
        paidAmount: 0,
        kind: "HIST:third_party_auto",
      }),
      // collection_detail ×20 live: unpaid_amount EMPTY → remaining 0 (not amount)
      ...[1, 2, 3, 4, 5].map((n) =>
        inst(`I-coll-${n}`, {
          customerId: "1838500",
          policyId: `P-coll-${n}`,
          status: "overdue",
          amount: 100_000_000,
          paidAmount: 0,
          unpaidAmount: null,
          kind: "collection_detail",
          dueDate: "1403/01/0" + ((n % 9) + 1),
        }),
      ),
      // followup ×4 live: unpaid empty, amount=78559453 → remaining 0
      ...[1, 2, 3, 4].map((n) =>
        inst(`I-follow-${n}`, {
          customerId: "1838500",
          policyId: `P-omid-${n}`,
          status: "overdue",
          amount: 78_559_453,
          paidAmount: 0,
          unpaidAmount: null,
          kind: "followup",
          dueDate: "1405/02/30",
        }),
      ),
      // unpaid_due: real arrears ≈ 78.5M × 4 → gold
      ...[1, 2, 3, 4].map((n) =>
        inst(`I-unpaid-${n}`, {
          customerId: "1838500",
          policyId: `P-omid-${n}`,
          status: "overdue",
          amount: 78_559_453,
          paidAmount: 0,
          unpaidAmount: 78_559_453,
          kind: "unpaid_due",
          dueDate: "1403/01/0" + n,
        }),
      ),
      // delay_700 live: due_date EMPTY — must policy-dedupe with unpaid_due
      ...[1, 2, 3, 4].map((n) =>
        inst(`I-delay-${n}`, {
          customerId: "1838500",
          policyId: `P-omid-${n}`,
          status: "overdue",
          amount: 78_559_453,
          paidAmount: 0,
          unpaidAmount: 78_559_453,
          kind: "delay_700",
          dueDate: "",
        }),
      ),
    ];
    expect(isOpenDebtKind("unpaid_due")).toBe(true);
    expect(isOpenDebtKind("delay_700")).toBe(true);
    expect(isOpenDebtKind("collection_detail")).toBe(false);
    expect(isOpenDebtKind("followup")).toBe(false);
    expect(remainingAmount(rows.find((r) => r.id === "I-coll-1")!)).toBe(0);
    expect(remainingAmount(rows.find((r) => r.id === "I-follow-1")!)).toBe(0);
    expect(openDebtDedupeKey(rows.find((r) => r.id === "I-delay-1")!)).toBe(
      openDebtDedupeKey(rows.find((r) => r.id === "I-unpaid-1")!),
    );
    const summary = summarizeDebt(rows);
    expect(summary.historyCount).toBeGreaterThanOrEqual(1);
    expect(summary.unpaidCount).toBe(4);
    expect(summary.overdueCount).toBe(4);
    expect(summary.unpaidBalance).toBe(314_237_812);
    expect(summary.overdueBalance).toBe(314_237_812);
    // VERIFY gate: ∈ [300M, 330M], open ∈ {3,4,5}; never ~1.06B
    expect(summary.unpaidBalance).toBeGreaterThanOrEqual(300_000_000);
    expect(summary.unpaidBalance).toBeLessThanOrEqual(330_000_000);
    expect([3, 4, 5]).toContain(summary.unpaidCount);
    expect(summary.unpaidBalance).toBeLessThan(1_000_000_000);
    expect(dedupeOpenInstallments(rows).every((r) => !isHistoryInstallment(r))).toBe(true);
    expect(
      dedupeOpenInstallments(rows).every(
        (r) => (r.kind ?? "").startsWith("unpaid_due") || (r.kind ?? "").startsWith("delay"),
      ),
    ).toBe(true);
  });

  test("Path A: followup with unpaid_amount set still excluded (never open debt)", () => {
    const follow = inst("I-followup-2215/1403/18/5622-1-1405/02/30-970", {
      customerId: "1838500",
      policyId: "P-omid-1",
      status: "overdue",
      amount: 78_559_453,
      paidAmount: 0,
      unpaidAmount: 78_559_453,
      kind: "followup",
      dueDate: "1405/02/30",
    });
    expect(remainingAmount(follow)).toBe(0);
    expect(summarizeDebt([follow]).unpaidBalance).toBe(0);
    expect(summarizeDebt([follow]).overdueCount).toBe(0);
  });

  test("Path A: live dossier omit-kind id prefixes — 1838500 followup×4 must not double unpaid_due×4", () => {
    // FACT: GET /api/customers/1838500 ships installments without `kind`; kind lives in id.
    // Before: followup fell through to amount−paid → UI 628,475,624 / 8.
    // After: infer followup from I-followup-… → remaining 0; gold 314,237,812 / 4.
    const rows: Installment[] = [
      ...[1, 2, 3, 4].map((n) => {
        const pol = ["5622", "5632", "5634", "5639"][n - 1];
        return inst(`I-followup-2215/1403/18/${pol}-1-1405/02/30-${900 + n}`, {
          customerId: "1838500",
          policyId: `P-omid-${n}`,
          status: "overdue",
          amount: 78_559_453,
          paidAmount: 0,
          unpaidAmount: null,
          // kind intentionally omitted — live dossier shape
          dueDate: "1405/02/30",
        });
      }),
      ...[1, 2, 3, 4].map((n) => {
        const pol = ["5622", "5632", "5634", "5639"][n - 1];
        return inst(`I-unpaid_d-2215/1403/18/${pol}-1-1405/02/30-${840 + n}`, {
          customerId: "1838500",
          policyId: `P-omid-${n}`,
          status: "overdue",
          amount: 78_559_453,
          paidAmount: 0,
          unpaidAmount: 78_559_453,
          dueDate: "1403/01/0" + n,
        });
      }),
      ...[1, 2, 3, 4].map((n) => {
        const pol = ["5622", "5632", "5634", "5639"][n - 1];
        return inst(`I-delay_70-2215/1403/18/${pol}---${280 + n}`, {
          customerId: "1838500",
          policyId: `P-omid-${n}`,
          status: "overdue",
          amount: 0,
          paidAmount: 0,
          unpaidAmount: 78_559_453,
          dueDate: "",
        });
      }),
    ];
    expect(inferImportKindFromId(rows[0].id)).toBe("followup");
    expect(inferImportKindFromId(rows[4].id)).toBe("unpaid_due");
    expect(inferImportKindFromId(rows[8].id)).toBe("delay_70");
    expect(remainingAmount(rows[0])).toBe(0);
    expect(remainingAmount(rows[4])).toBe(78_559_453);
    const summary = summarizeDebt(rows);
    expect(summary.unpaidCount).toBe(4);
    expect(summary.overdueCount).toBe(4);
    expect(summary.unpaidBalance).toBe(314_237_812);
    expect(summary.overdueBalance).toBe(314_237_812);
    // Must not be the ×2 live bug
    expect(summary.unpaidBalance).not.toBe(628_475_624);
    expect(summary.overdueCount).not.toBe(8);
  });

  test("Path A UI: empty policyId — id-embedded pol key dedupes unpaid_due↔delay; followup excluded from table", () => {
    // LIVE wire FACT: kind=null, policyId="", computerCode=""; policy lives in id.
    // Without policyKeyFromInstallment, dedupe key = full id → 8 open (delay+unpaid) or
    // followup+unpaid → 628,475,624. Gold Path A: 314,237,812 / 4.
    const pols = ["5622", "5632", "5634", "5639"] as const;
    const rows: Installment[] = [
      ...pols.map((pol, idx) =>
        inst(`I-followup-2215/1403/18/${pol}-1-1405/02/30-${900 + idx}`, {
          customerId: "1838500",
          policyId: "",
          status: "overdue",
          amount: 78_559_453,
          paidAmount: 0,
          unpaidAmount: null,
          dueDate: "1405/02/30",
        }),
      ),
      ...pols.map((pol, idx) =>
        inst(`I-unpaid_d-2215/1403/18/${pol}-1-1405/02/30-${840 + idx}`, {
          customerId: "1838500",
          policyId: "",
          status: "overdue",
          amount: 78_559_453,
          paidAmount: 0,
          unpaidAmount: null,
          dueDate: "1405/02/30",
        }),
      ),
      // delay may carry unpaid_amount in some hydrates — still must collapse into unpaid_due
      ...pols.map((pol, idx) =>
        inst(`I-delay_70-2215/1403/18/${pol}---${280 + idx}`, {
          customerId: "1838500",
          policyId: "",
          status: "overdue",
          amount: 0,
          paidAmount: 0,
          unpaidAmount: 78_559_453,
          dueDate: "",
        }),
      ),
    ];
    expect(policyKeyFromInstallment(rows[0])).toBe("2215/1403/18/5622");
    expect(policyKeyFromInstallment(rows[4])).toBe("2215/1403/18/5622");
    expect(policyKeyFromInstallment(rows[8])).toBe("2215/1403/18/5622");
    expect(openDebtDedupeKey(rows[4])).toBe(openDebtDedupeKey(rows[8]));
    expect(remainingAmount(rows[0])).toBe(0);
    expect(remainingAmount(rows[4])).toBe(78_559_453);

    const summary = summarizeDebt(rows);
    expect(summary.unpaidBalance).toBe(314_237_812);
    expect(summary.openCount).toBe(4);
    expect(summary.overdueCount).toBe(4);
    expect(summary.unpaidBalance).not.toBe(628_475_624);
    expect(summary.openCount).not.toBe(8);

    const parts = partitionInstallments(rows);
    expect(parts.open.length + parts.overdue.length).toBe(4);
    expect(
      [...parts.open, ...parts.overdue].every((r) => {
        const k = (r.kind ?? inferImportKindFromId(r.id) ?? "").toLowerCase();
        return k.startsWith("unpaid_due") || k.startsWith("delay");
      }),
    ).toBe(true);
    expect(
      [...parts.open, ...parts.overdue].some((r) =>
        (inferImportKindFromId(r.id) ?? "").startsWith("follow"),
      ),
    ).toBe(false);
  });


  test("holder 7339291-like HIST-only row yields ≈0 debt", () => {
    const summary = summarizeDebt([
      inst("I-HIST-7339291", {
        customerId: "7339291",
        policyId: "P-x",
        status: "history",
        amount: 0,
        paidAmount: 0,
        kind: "HIST:universal_life",
      }),
    ]);
    expect(summary.unpaidBalance).toBe(0);
    expect(summary.overdueBalance).toBe(0);
    expect(summary.unpaidCount).toBe(0);
  });

  test("overdueDays only for unpaid past-due using dueDate", () => {
    const asOf = new Date("2026-09-24T00:00:00.000Z");
    const overdue = inst("o", {
      customerId: "C-1",
      policyId: "P-1",
      status: "overdue",
      amount: 100,
      paidAmount: 0,
      unpaidAmount: 100,
      dueDate: "2026-09-01",
    });
    const hist = inst("h", {
      customerId: "C-1",
      policyId: "P-1",
      status: "history",
      amount: 1e12,
      paidAmount: 0,
      dueDate: "1399/05/13",
    });
    const future = inst("f", {
      customerId: "C-1",
      policyId: "P-1",
      status: "due",
      amount: 100,
      paidAmount: 0,
      dueDate: "2026-12-01",
    });
    expect(overdueDays(overdue, asOf)).toBe(23);
    expect(Number.isFinite(overdueDays(hist, asOf))).toBe(false);
    expect(Number.isFinite(overdueDays(future, asOf))).toBe(false);
  });

  test("relatedInstallments rejects other holderCode rows", () => {
    const rows = [
      inst("mine", { customerId: "1838500", policyId: "P-1", status: "overdue", holderCode: "1838500" }),
      inst("other", { customerId: "1838500", policyId: "P-1", status: "overdue", holderCode: "7339291", amount: 999 }),
    ];
    const related = relatedInstallments(rows, "1838500", new Set(["P-1"]), {
      id: "1838500",
      holderCode: "1838500",
    });
    expect(related.map((r) => r.id)).toEqual(["mine"]);
  });
});

describe("renewalBucket", () => {
  const today = new Date("2026-09-11T00:00:00.000Z");

  test("splits missed / near / far from end dates", () => {
    expect(renewalBucket("2026-08-01", today)).toBe("missed");
    expect(renewalBucket("2026-10-01", today)).toBe("near");
    expect(renewalBucket("2027-09-11", today)).toBe("far");
    expect(renewalBucket("", today)).toBeNull();
  });

  test("classifies live Jalali endDate strings into the 45-day window", () => {
    const asOf = new Date("2025-07-01T00:00:00.000Z");
    expect(renewalBucket("1404/04/19", asOf)).toBe("near");
    expect(renewalBucket("1404/01/01", asOf)).toBe("missed");
    expect(renewalBucket("1405/06/01", asOf)).toBe("far");
  });

  test("bucketPolicies groups only dated rows", () => {
    const rows = [
      policy("a", "C-1"),
      { ...policy("b", "C-1"), endDate: "2026-08-01" },
      { ...policy("c", "C-1"), endDate: "2026-10-01" },
      { ...policy("d", "C-1"), endDate: "" },
    ];
    rows[0] = { ...rows[0], endDate: "2027-09-11" };
    const grouped = bucketPolicies(rows, today);
    expect(grouped.missed.map((p) => p.id)).toEqual(["b"]);
    expect(grouped.near.map((p) => p.id)).toEqual(["c"]);
    expect(grouped.far.map((p) => p.id)).toEqual(["a"]);
  });
});

describe("findCustomerByParam", () => {
  const row = { id: "C-0011748206", nationalId: "0011748206", fullName: "بهناز شریفی" };

  test("matches C- prefix, raw national id, and decoded param", () => {
    expect(findCustomerByParam([row], "C-0011748206")?.fullName).toBe("بهناز شریفی");
    expect(findCustomerByParam([row], "0011748206")?.id).toBe("C-0011748206");
    expect(findCustomerByParam([row], encodeURIComponent("C-0011748206"))?.id).toBe("C-0011748206");
  });
});

describe("dossierHolderCodes", () => {
  test("returns unique holder_code values", () => {
    expect(
      dossierHolderCodes(
        [{ holderCode: "88012" }, { holderCode: "88012" }],
        [{ holderCode: "99001" }],
      ),
    ).toBe("88012، 99001");
  });
});

describe("dossierCustomerId", () => {
  test("prefers customerId then policy holder", () => {
    expect(dossierCustomerId({ customerId: "C-1" })).toBe("C-1");
    expect(
      dossierCustomerId({
        customerId: "",
        policyId: "P-1",
        policies: [policy("P-1", "C-9")],
      }),
    ).toBe("C-9");
  });
});

describe("policyDisplayNumber", () => {
  test("falls back from number to computer code", () => {
    expect(policyDisplayNumber({ number: "7", computerCode: "99001" })).toBe("7");
    expect(policyDisplayNumber({ number: "", computerCode: "99001" })).toBe("99001");
    expect(policyDisplayNumber({ number: "  ", computerCode: "", id: "P-1" })).toBe("P-1");
  });
});

describe("searchCrmDossierHits", () => {
  test("finds customer by name and policy by computer code", () => {
    const customers = [{ id: "C-1", fullName: "فاطمه محمدی", nationalId: "001", phone: "0912" }];
    const policies = [
      { id: "P-1", number: "", computerCode: "88012", customerId: "C-1", kind: "بدنه" },
    ];
    expect(searchCrmDossierHits("فاطمه", customers, policies)[0]?.customerId).toBe("C-1");
    expect(searchCrmDossierHits("88012", customers, policies)[0]?.kind).toBe("policy");
  });
});
