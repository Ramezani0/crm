import { describe, expect, test } from "bun:test";
import {
  PREMIUM_AI_MOCK_MODEL_LABEL,
  PREMIUM_AI_MODEL,
  PREMIUM_AI_SYSTEM_BRIEF,
  buildAdvisorUserPayload,
  mockAdvise,
  noClaimDiscountPct,
} from "./premium-ai-advisor";
import { PREMIUM_AI_KNOWLEDGE } from "./premium-ai-system-brief";
import { DEFAULT_VEHICLE_INPUTS, type VehicleInputs } from "./premium-compare-mock";

const complete: VehicleInputs = {
  ...DEFAULT_VEHICLE_INPUTS,
  plate: { platePart1: "12", plateLetter: "ب", platePart2: "345", plateIranCode: "11" },
  nationalId: "0013542419",
  year: "1402",
  usage: "شخصی",
  vehicleType: "سواری",
  financialCover: 70_000_000,
  noClaimYears: "5",
};

describe("premium AI labels", () => {
  test("browser never hardcodes live gemini-2.0-flash", () => {
    expect(PREMIUM_AI_MODEL).toBe("mock");
    expect(PREMIUM_AI_MOCK_MODEL_LABEL).toBe("mock");
    expect(PREMIUM_AI_MODEL).not.toContain("gemini-2.0");
    expect(PREMIUM_AI_SYSTEM_BRIEF).toContain("LOCKED");
    expect(PREMIUM_AI_SYSTEM_BRIEF).toContain("۷۰");
  });

  test("knowledge: diya 1405, min financial ~70M, no-claim 5%/yr to 70%", () => {
    expect(PREMIUM_AI_KNOWLEDGE.diyaYear).toBe(1405);
    expect(PREMIUM_AI_KNOWLEDGE.minFinancialCoverToman).toBe(70_000_000);
    expect(PREMIUM_AI_KNOWLEDGE.noClaimDiscountPerYearPct).toBe(5);
    expect(PREMIUM_AI_KNOWLEDGE.noClaimDiscountCapPct).toBe(70);
    expect(PREMIUM_AI_KNOWLEDGE.listAllReturnedCompanies).toBe(true);
  });
});

describe("noClaimDiscountPct", () => {
  test("5% per year capped at 70%", () => {
    expect(noClaimDiscountPct("0")).toBe(0);
    expect(noClaimDiscountPct("5")).toBe(25);
    expect(noClaimDiscountPct("14")).toBe(70);
    expect(noClaimDiscountPct("20")).toBe(70);
  });
});

describe("mockAdvise", () => {
  test("asks missing fields and never invents numbers", () => {
    const reply = mockAdvise({ line: "third_party", inputs: { ...DEFAULT_VEHICLE_INPUTS } });
    expect(reply.ok).toBe(true);
    expect(reply.mode).toBe("mock");
    expect(reply.inventsNumbers).toBe(false);
    expect(reply.model).toBeUndefined();
    expect(reply.modelLabel).toBe("mock");
    expect(reply.missingFields.length).toBeGreaterThan(0);
    expect(reply.content).toContain("عدد جعلی");
    expect(reply.content).not.toMatch(/حق‌?بیمه\s*(شما|پیشنهادی)\s*[:：]?\s*[\d۰-۹,]{6,}/);
  });

  test("when complete, cites knowledge and full insurer list rule", () => {
    const reply = mockAdvise({ line: "third_party", inputs: complete, rows: Array.from({ length: 22 }, (_, i) => ({
      id: `i${i}`,
      name: `c${i}`,
      thirdParty: 1,
      body: 1,
    })) });
    expect(reply.missingFields).toEqual([]);
    expect(reply.content).toContain("۱۴۰۵");
    expect(reply.content).toMatch(/۷۰/);
    expect(reply.content).toContain("بدون truncate");
    expect(reply.inventsNumbers).toBe(false);
    expect(reply.modelLabel).toBe(PREMIUM_AI_MOCK_MODEL_LABEL);
  });
});

describe("buildAdvisorUserPayload", () => {
  test("includes missing labels when incomplete", () => {
    const text = buildAdvisorUserPayload(
      { line: "third_party", inputs: DEFAULT_VEHICLE_INPUTS },
      "سلام",
    );
    expect(text).toContain("ناقص");
    expect(text).toContain("سلام");
  });
});
