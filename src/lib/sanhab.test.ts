import { describe, expect, test } from "bun:test";
import {
  DEFAULT_INDUSTRY_CEILING_RIAL,
  SOURCE_BIMEBAZAR,
  SOURCE_LABEL_BIMEBAZAR,
  UNIQUE_CODE_RE,
  VEHICLE_INQUIRY_LABEL_FA,
  checkDeathOverLimit,
  isValidUniqueCode,
  previewUniqueCodeFormat,
} from "./sanhab";

describe("death ceiling over-limit", () => {
  test("under limit", () => {
    const c = checkDeathOverLimit(10_000_000_000, 5_000_000_000, DEFAULT_INDUSTRY_CEILING_RIAL);
    expect(c.overLimit).toBe(false);
    expect(c.totalAfterRial).toBe(15_000_000_000);
    expect(c.headroomRial).toBe(40_000_000_000);
  });

  test("over limit", () => {
    const c = checkDeathOverLimit(48_000_000_000, 5_000_000_000, 50_000_000_000);
    expect(c.overLimit).toBe(true);
    expect(c.excessRial).toBe(3_000_000_000);
  });

  test("exact ceiling not over", () => {
    const c = checkDeathOverLimit(40_000_000_000, 10_000_000_000, 50_000_000_000);
    expect(c.overLimit).toBe(false);
    expect(c.excessRial).toBe(0);
  });
});

describe("unique code format", () => {
  test("regex accepts SNH-YYYYMMDD-HEX8", () => {
    const code = previewUniqueCodeFormat("20260924", "A1B2C3D4");
    expect(code).toBe("SNH-20260924-A1B2C3D4");
    expect(UNIQUE_CODE_RE.test(code)).toBe(true);
    expect(isValidUniqueCode(code)).toBe(true);
  });

  test("rejects bad format", () => {
    expect(isValidUniqueCode("BAD-CODE")).toBe(false);
    expect(isValidUniqueCode("SNH-20260924-gg")).toBe(false);
    expect(isValidUniqueCode(null)).toBe(false);
  });
});

describe("vehicle inquiry honest labels", () => {
  test("never claims official Sanhab", () => {
    expect(VEHICLE_INQUIRY_LABEL_FA).toBe("استعلام از طریق بیمه‌بازار");
    expect(VEHICLE_INQUIRY_LABEL_FA).not.toContain("سنهاب رسمی");
    expect(SOURCE_BIMEBAZAR).toBe("BIMEBAZAR_PARTNER");
    expect(SOURCE_LABEL_BIMEBAZAR).toBe("بیمه‌بازار");
  });
});
