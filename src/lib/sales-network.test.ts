import { describe, expect, test } from "bun:test";
import {
  DEMO_ISSUANCE_PCT,
  DEMO_WITHHOLDING_TAX_PCT,
  flattenAgents,
  previewCommissionLocal,
  roundRial,
  type SalesAgent,
} from "./sales-network";

const demoAgents: SalesAgent[] = [
  {
    id: 1,
    code: "G-3045",
    fullName: "فاطمه فصیحی",
    parentId: null,
    role: "general",
    roleLabel: "جنرال",
    active: true,
    phone: "",
    nationalId: "",
    notes: "",
    createdAt: "",
  },
  {
    id: 2,
    code: "A96-01",
    fullName: "آیین۹۶",
    parentId: 1,
    role: "ayeen96",
    roleLabel: "آیین۹۶",
    active: true,
    phone: "",
    nationalId: "",
    notes: "",
    createdAt: "",
  },
  {
    id: 3,
    code: "BR-01",
    fullName: "کارگزار",
    parentId: 2,
    role: "broker",
    roleLabel: "کارگزار",
    active: true,
    phone: "",
    nationalId: "",
    notes: "",
    createdAt: "",
  },
  {
    id: 4,
    code: "DM-01",
    fullName: "مدیرتوسعه",
    parentId: 3,
    role: "development_manager",
    roleLabel: "مدیرتوسعه",
    active: true,
    phone: "",
    nationalId: "",
    notes: "",
    createdAt: "",
  },
  {
    id: 5,
    code: "MK-01",
    fullName: "بازاریاب",
    parentId: 4,
    role: "marketer",
    roleLabel: "بازاریاب",
    active: true,
    phone: "",
    nationalId: "",
    notes: "",
    createdAt: "",
  },
];

describe("previewCommissionLocal DEMO_DEFAULTS", () => {
  test("year1 marketer chain matches backend math", () => {
    const r = previewCommissionLocal({
      premiumRial: 10_000_000,
      policyYear: 1,
      agentId: 5,
      agents: demoAgents,
    });
    expect(r.ok).toBe(true);
    expect(r.splits?.[0]).toMatchObject({
      kind: "issuance",
      ratePct: 20,
      grossRial: 2_000_000,
      taxRial: 200_000,
      netRial: 1_800_000,
    });
    expect(r.splits?.[1]).toMatchObject({
      kind: "collection",
      ratePct: 5,
      grossRial: 500_000,
    });
    expect(r.splits?.filter((s) => s.kind === "supervisory")).toHaveLength(4);
    expect(r.totals?.grossRial).toBe(2_875_000);
    expect(r.withholdingTaxPct).toBe(DEMO_WITHHOLDING_TAX_PCT);
  });

  test("year5 declining issuance", () => {
    const r = previewCommissionLocal({
      premiumRial: 1_000_000,
      policyYear: 5,
      agentId: 5,
      agents: demoAgents,
    });
    expect(r.splits?.[0].ratePct).toBe(DEMO_ISSUANCE_PCT[5]);
    expect(r.splits?.[0].grossRial).toBe(80_000);
  });

  test("root has no supervisory", () => {
    const r = previewCommissionLocal({
      premiumRial: 1_000_000,
      policyYear: 1,
      agentId: 1,
      agents: demoAgents,
    });
    expect(r.splits?.map((s) => s.kind)).toEqual(["issuance", "collection"]);
  });
});

describe("helpers", () => {
  test("roundRial", () => {
    expect(roundRial(10.4)).toBe(10);
    expect(roundRial(10.6)).toBe(11);
  });

  test("flattenAgents", () => {
    const tree: SalesAgent[] = [
      { ...demoAgents[0], children: [{ ...demoAgents[1], children: [] }] },
    ];
    expect(flattenAgents(tree)).toHaveLength(2);
  });
});
