import { describe, expect, test } from "bun:test";
import type { ApiDataResponse } from "./api";
import {
  asIdentifier,
  deriveInstallmentStatus,
  displayPolicyKind,
  fillPolicyHolderCodes,
  mapApiSnapshot,
  mapCustomer,
  mapPolicy,
  pickHolderCode,
} from "./map-api-data";

describe("asIdentifier", () => {
  test("keeps leading zeros on national id / phone-like strings", () => {
    expect(asIdentifier("0012345678")).toBe("0012345678");
    expect(asIdentifier("09121234567")).toBe("09121234567");
    expect(asIdentifier("01063009330")).toBe("01063009330");
  });

  test("does not invent zeros for numeric values", () => {
    expect(asIdentifier(12345678)).toBe("12345678");
  });
});

describe("displayPolicyKind", () => {
  test("maps known live aliases for display only", () => {
    expect(displayPolicyKind("سواری")).toBe("شخص ثالث");
    expect(displayPolicyKind("اتومبیل")).toBe("شخص ثالث");
    expect(displayPolicyKind("درمان")).toBe("درمان تکمیلی");
    expect(displayPolicyKind("آتش سوزی")).toBe("آتش‌سوزی");
    expect(displayPolicyKind("عمر و سرمايه گذاري")).toBe("عمر و سرمایه‌گذاری");
  });

  test("keeps unmapped kinds instead of forcing عمر", () => {
    expect(displayPolicyKind("مهندسی")).toBe("مهندسی");
    expect(displayPolicyKind("باربری")).toBe("باربری");
  });

  test("maps live import snake_case codes onto FIELD_CARD_KINDS labels", () => {
    expect(displayPolicyKind("third_party_auto")).toBe("شخص ثالث");
    expect(displayPolicyKind("body_auto")).toBe("بدنه");
    expect(displayPolicyKind("universal_life")).toBe("عمر و سرمایه‌گذاری");
    expect(displayPolicyKind("omid_retirement")).toBe("عمر و سرمایه‌گذاری");
    expect(displayPolicyKind("fire")).toBe("آتش‌سوزی");
    expect(displayPolicyKind("fire_family")).toBe("آتش‌سوزی");
    expect(displayPolicyKind("liability_employer")).toBe("مسئولیت");
    expect(displayPolicyKind("liability_civil")).toBe("مسئولیت");
    expect(displayPolicyKind("LIABILITY_DOCTORS")).toBe("مسئولیت");
  });

  test("leaves ledger/non-product kinds unmapped (not forced into field cards)", () => {
    expect(displayPolicyKind("collection_detail")).toBe("collection_detail");
    expect(displayPolicyKind("unpaid_due")).toBe("unpaid_due");
    expect(displayPolicyKind("delay_700")).toBe("delay_700");
    expect(displayPolicyKind("overdue_installments")).toBe("overdue_installments");
  });
});

describe("deriveInstallmentStatus", () => {
  const asOf = new Date("2026-09-11T12:00:00.000Z");

  test("uses amounts before due-date", () => {
    expect(deriveInstallmentStatus({ amount: 100, paidAmount: 100, dueDate: "2026-01-01", status: "overdue" }, asOf)).toBe(
      "paid",
    );
    expect(deriveInstallmentStatus({ amount: 100, paidAmount: 40, dueDate: "2026-01-01", status: "overdue" }, asOf)).toBe(
      "partial",
    );
  });

  test("maps unpaid past due to overdue and future to due", () => {
    expect(deriveInstallmentStatus({ amount: 100, paidAmount: 0, dueDate: "2026-06-01", status: "overdue" }, asOf)).toBe(
      "overdue",
    );
    expect(deriveInstallmentStatus({ amount: 100, paidAmount: 0, dueDate: "2026-12-01", status: "overdue" }, asOf)).toBe(
      "due",
    );
  });

  test("parses live Jalali dueDate instead of treating it as invalid", () => {
    expect(deriveInstallmentStatus({ amount: 100, paidAmount: 0, dueDate: "1404/11/10", status: "overdue" }, asOf)).toBe(
      "overdue",
    );
    expect(deriveInstallmentStatus({ amount: 100, paidAmount: 0, dueDate: "1405/12/01", status: "overdue" }, asOf)).toBe(
      "due",
    );
  });

  test("never maps HIST/history to overdue even if API coerced status", () => {
    expect(
      deriveInstallmentStatus(
        { amount: 1e9, paidAmount: 0, dueDate: "1399/01/01", status: "overdue", statusLabel: "history" },
        asOf,
      ),
    ).toBe("history");
    expect(
      deriveInstallmentStatus(
        { amount: 1e9, paidAmount: 0, dueDate: "1399/01/01", status: "overdue", kind: "HIST:universal_life", id: "I-HIST-x" },
        asOf,
      ),
    ).toBe("history");
  });
});

describe("pickHolderCode", () => {
  test("reads camelCase, snake_case, and extras — not nationalId or 3045", () => {
    expect(pickHolderCode({ holderCode: "88012" })).toBe("88012");
    expect(pickHolderCode({ holder_code: "99001" })).toBe("99001");
    expect(pickHolderCode({ extras: { holder_code: "77001" } })).toBe("77001");
    expect(pickHolderCode({ extras: { "کد بیمه‌گذار": "66001" } })).toBe("66001");
    expect(pickHolderCode({})).toBe("");
  });
});

describe("fillPolicyHolderCodes", () => {
  test("fills empty policy holder_code from installments, then customer", () => {
    const policies = fillPolicyHolderCodes(
      [
        { id: "P-1", customerId: "C-1", holderCode: "" },
        { id: "P-2", customerId: "C-2", holderCode: "" },
      ],
      [{ policyId: "P-1", holderCode: "88012" }],
      [
        { id: "C-1", holderCode: "should-not-win" },
        { id: "C-2", holderCode: "99001" },
      ],
    );
    expect(policies[0].holderCode).toBe("88012");
    expect(policies[1].holderCode).toBe("99001");
  });
});

describe("mapApiSnapshot", () => {
  const sample: ApiDataResponse = {
    customers: [
      {
        id: "C-0012345678",
        fullName: "فاطمه محمدی",
        nationalId: "0012345678",
        legalEntityId: "",
        phone: "",
        email: "",
        city: "",
        status: "active",
        segment: "حقیقی",
        agent: "",
        createdAt: "2026-09-11T00:00:00+00:00",
        note: "",
      },
    ],
    policies: [
      {
        id: "P-1",
        number: "7",
        customerId: "C-0012345678",
        kind: "اتومبیل",
        company: "بیمه کارآفرین",
        premium: 12_000_000,
        startDate: "2025-01-01",
        endDate: "2026-01-01",
        status: "active",
        installmentCount: 1,
      },
    ],
    installments: [
      {
        id: "I-1",
        policyId: "P-1",
        customerId: "C-0012345678",
        seq: 1,
        amount: 4_000_000,
        paidAmount: 0,
        dueDate: "2026-06-01",
        status: "overdue",
        payments: [],
      },
      {
        id: "I-2",
        policyId: "P-1",
        customerId: "C-0012345678",
        seq: 2,
        amount: 4_000_000,
        paidAmount: 0,
        dueDate: "2026-12-01",
        status: "overdue",
        payments: [],
      },
    ],
  };

  test("maps live extra fields without dropping identifiers or kinds", () => {
    const mapped = mapApiSnapshot(
      {
        customers: [
          {
            ...sample.customers[0],
            statusLabel: "عادی",
            address: "تهران",
            extras: { sourceSystem: "fasihicrm" },
          },
        ],
        policies: [
          {
            ...sample.policies[0],
            kind: "مسئولیت پزشکان",
            kindRaw: "مسئولیت پزشکان",
            computerCode: "77001",
            holderCode: "H-9",
            holderNationalId: "0012345678",
            statusLabel: "عادی",
          },
        ],
        installments: [
          {
            ...sample.installments[0],
            computerCode: "77001",
            holderCode: "H-9",
            paymentMethod: "کارت به کارت",
            seq: 3,
          },
        ],
      },
      new Date("2026-09-11T00:00:00Z"),
    );
    expect(mapped.policies[0].kind).toBe("مسئولیت پزشکان");
    expect(mapped.policies[0].computerCode).toBe("77001");
    expect(mapped.policies[0].holderCode).toBe("H-9");
    expect(mapped.policies[0].holderCode).not.toBe("0012345678");
    expect(mapped.policies[0].holderCode).not.toBe("3045");
    expect(mapped.installments[0].paymentMethod).toBe("کارت به کارت");
    expect(mapped.installments[0].seq).toBe(3);
    expect(mapped.customers[0].statusLabel).toBe("عادی");
    expect(mapped.customers[0].extras?.sourceSystem).toBe("fasihicrm");
  });

  test("preserves leading zeros, empty phone/city, and live row counts", () => {
    const mapped = mapApiSnapshot(sample, new Date("2026-09-11T00:00:00Z"));
    expect(mapped.customers).toHaveLength(1);
    expect(mapped.policies).toHaveLength(1);
    expect(mapped.installments).toHaveLength(2);
    const c = mapped.customers[0];
    expect(c.nationalId).toBe("0012345678");
    expect(c.legalEntityId).toBe("");
    expect(c.id).toBe("C-0012345678");
    expect(c.phone).toBe("");
    expect(c.city).toBe("");
    expect(mapped.policies[0].kind).toBe("شخص ثالث");
    expect(mapped.policies[0].installmentCount).toBe(2);
    expect(mapped.installments[0].status).toBe("overdue");
    expect(mapped.installments[1].status).toBe("due");
  });
});

describe("mapCustomer", () => {
  const base = {
    id: "C-1",
    fullName: "آزمون",
    nationalId: "001",
    legalEntityId: "",
    phone: "0912",
    email: "",
    city: "تهران",
    status: "active" as const,
    segment: "حقوقی" as const,
    agent: "",
    createdAt: "",
    note: "",
  };

  test("defaults unknown status/segment without dropping the row", () => {
    const c = mapCustomer(base, 0);
    expect(c.segment).toBe("حقوقی");
    expect(c.status).toBe("active");
    expect(c.legalEntityId).toBe("");
  });

  test("maps legalEntityId when present and keeps it as an identifier string", () => {
    const c = mapCustomer(
      { ...base, id: "C-L-10630093308", legalEntityId: "10630093308", nationalId: "" },
      0,
    );
    expect(c.legalEntityId).toBe("10630093308");
    expect(c.id).toBe("C-L-10630093308");
  });

  test("maps missing legalEntityId without inventing digits", () => {
    const { legalEntityId: _omit, ...without } = base;
    const c = mapCustomer(without, 0);
    expect(c.legalEntityId).toBe("");
  });

  test("preserves leading zeros on legalEntityId", () => {
    const c = mapCustomer({ ...base, legalEntityId: "01063009330" }, 0);
    expect(c.legalEntityId).toBe("01063009330");
  });

  test("maps customer holder_code from snake_case", () => {
    const c = mapCustomer({ ...base, holder_code: "88012" }, 0);
    expect(c.holderCode).toBe("88012");
  });
});

describe("mapPolicy", () => {
  const policyBase = {
    id: "P-1",
    number: "7",
    customerId: "C-1",
    kind: "بدنه",
    company: "بیمه کارآفرین",
    premium: 1,
    startDate: "1404/01/01",
    endDate: "1404/04/19",
    status: "active" as const,
    installmentCount: 1,
    holderNationalId: "0012345678",
  };

  test("maps holder_code snake_case and extras, not nationalId", () => {
    expect(mapPolicy({ ...policyBase, holder_code: "88012" }, 0).holderCode).toBe("88012");
    expect(mapPolicy({ ...policyBase, extras: { holderCode: "99001" } }, 0).holderCode).toBe("99001");
    expect(mapPolicy(policyBase, 0).holderCode).toBe("");
    expect(mapPolicy(policyBase, 0).holderCode).not.toBe("0012345678");
    expect(mapPolicy(policyBase, 0).holderCode).not.toBe("3045");
  });

  test("maps initialPremium and premiumAdjPct (not Excel premium as P0)", () => {
    const mapped = mapPolicy(
      {
        ...policyBase,
        premium: 99_000_000,
        initialPremium: 2_000_000,
        premiumAdjPct: 10,
      },
      0,
    );
    expect(mapped.premium).toBe(99_000_000);
    expect(mapped.initialPremium).toBe(2_000_000);
    expect(mapped.premiumAdjPct).toBe(10);
  });

  test("falls back to extras for IP/adj when top-level absent", () => {
    const mapped = mapPolicy(
      {
        ...policyBase,
        extras: { initialPremium: "2200000", premiumAdjPct: "10" },
      },
      0,
    );
    expect(mapped.initialPremium).toBe(2_200_000);
    expect(mapped.premiumAdjPct).toBe(10);
  });


  test("maps initialPremiumStart from top-level (ladder P0)", () => {
    const mapped = mapPolicy(
      {
        ...policyBase,
        premium: 99_000_000,
        initialPremium: 20_000_000,
        initialPremiumStart: 4_000_000,
        premiumAdjPct: 10,
      } as typeof policyBase & {
        initialPremium?: number;
        initialPremiumStart?: number;
        premiumAdjPct?: number;
      },
      0,
    );
    expect(mapped.initialPremium).toBe(20_000_000);
    expect(mapped.initialPremiumStart).toBe(4_000_000);
    expect(mapped.premium).toBe(99_000_000);
  });

  test("falls back to extras.initialPremiumStart / snake for start P0", () => {
    const camel = mapPolicy(
      {
        ...policyBase,
        initialPremium: 30_000_000,
        extras: { initialPremiumStart: "7000000" },
      } as typeof policyBase & { initialPremium?: number },
      0,
    );
    expect(camel.initialPremiumStart).toBe(7_000_000);
    expect(camel.initialPremium).toBe(30_000_000);

    const snake = mapPolicy(
      {
        ...policyBase,
        extras: { initial_premium_start: "4000000" },
      },
      0,
    );
    expect(snake.initialPremiumStart).toBe(4_000_000);
  });
});
