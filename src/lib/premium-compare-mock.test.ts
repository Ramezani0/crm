import { describe, expect, test } from "bun:test";
import {
  BIMEBAZAR_SOURCE_CHIP_FA,
  DEFAULT_VEHICLE_INPUTS,
  MOCK_INSURER_COUNT,
  OTHER_DISCOVER_STUB_FA,
  buildMockCompareRows,
  categoryToPremiumLine,
  collectMissingFields,
  formatOfferDiscounts,
  formatSolvencyLevel,
  isCompletePlate,
  isValidNationalId,
  type VehicleInputs,
  premiumCompareSource,
} from "./premium-compare-mock";

describe("isValidNationalId", () => {
  test("accepts checksum-valid 10-digit id", () => {
    expect(isValidNationalId("0013542419")).toBe(true);
  });
  test("rejects wrong length and all-same digits", () => {
    expect(isValidNationalId("123")).toBe(false);
    expect(isValidNationalId("0000000000")).toBe(false);
  });
});

describe("plate + missing fields", () => {
  test("requires split plate parts", () => {
    expect(
      isCompletePlate({
        platePart1: "12",
        plateLetter: "ب",
        platePart2: "345",
        plateIranCode: "11",
      }),
    ).toBe(true);
    expect(
      isCompletePlate({
        platePart1: "1",
        plateLetter: "ب",
        platePart2: "345",
        plateIranCode: "11",
      }),
    ).toBe(false);
  });

  test("does not silent-default financialCover on third_party", () => {
    const values: VehicleInputs = {
      ...DEFAULT_VEHICLE_INPUTS,
      plate: { platePart1: "12", plateLetter: "ب", platePart2: "345", plateIranCode: "11" },
      nationalId: "0013542419",
      year: "1402",
      usage: "شخصی",
      vehicleType: "سواری",
      financialCover: null,
    };
    expect(collectMissingFields("third_party", values)).toContain("financialCover");
  });
});

describe("compare rows", () => {
  test("returns 20+ insurers without truncating", () => {
    const rows = buildMockCompareRows(70_000_000);
    expect(MOCK_INSURER_COUNT).toBeGreaterThanOrEqual(20);
    expect(rows.length).toBe(MOCK_INSURER_COUNT);
  });
});

describe("premiumCompareSource default", () => {
  test("is auto or live (mock only when env forces demo)", () => {
    const src = premiumCompareSource();
    expect(["auto", "live", "mock"]).toContain(src);
    // Product lock: unset env → auto, not silent mock primary
    if (!import.meta.env.VITE_PREMIUM_COMPARE_SOURCE) {
      expect(src).toBe("auto");
    }
  });
});

describe("bimebazar hub categories", () => {
  test("maps car_body → API line body; other_discover → null", () => {
    expect(categoryToPremiumLine("third_party")).toBe("third_party");
    expect(categoryToPremiumLine("car_body")).toBe("body");
    expect(categoryToPremiumLine("other_discover")).toBeNull();
  });

  test("partners chip + stub copy locked", () => {
    expect(BIMEBAZAR_SOURCE_CHIP_FA).toBe("از طریق پنل شرکای بیمه‌بازار");
    expect(OTHER_DISCOVER_STUB_FA).toContain("به‌زودی");
  });

  test("formatOfferDiscounts handles dict/list/null", () => {
    expect(formatOfferDiscounts(null)).toBe("—");
    expect(formatOfferDiscounts("۱۰٪")).toBe("۱۰٪");
    expect(formatOfferDiscounts({ noClaim: 5 })).toContain("noClaim");
    expect(formatSolvencyLevel(2)).toBe("2");
    expect(formatSolvencyLevel(null)).toBe("—");
  });
});
