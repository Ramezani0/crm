import { describe, expect, test } from "bun:test";
import {
  BARCODE_RE,
  isSha256Hex,
  isValidBarcode,
  mapOcrFields,
  previewBarcode,
} from "./dms";

describe("barcode unique format", () => {
  test("preview matches regex", () => {
    const code = previewBarcode("3045", "A1", "03", "Z12", "DEADBEEF");
    expect(code).toBe("DMS-BR3045-SHA1-RW03-BNZ12-DEADBEEF");
    expect(BARCODE_RE.test(code)).toBe(true);
    expect(isValidBarcode(code)).toBe(true);
  });

  test("rejects bad barcode", () => {
    expect(isValidBarcode("BAD")).toBe(false);
    expect(isValidBarcode("DMS-BR1-SH2-RW3-BN4-gg")).toBe(false);
    expect(isValidBarcode(null)).toBe(false);
  });

  test("different binders → different preview codes", () => {
    const a = previewBarcode("3045", "A1", "01", "Z1", "AAAAAAAA");
    const b = previewBarcode("3045", "A1", "01", "Z2", "BBBBBBBB");
    expect(a).not.toBe(b);
  });
});

describe("hash helper", () => {
  test("accepts 64 hex", () => {
    expect(isSha256Hex("a".repeat(64))).toBe(true);
    expect(isSha256Hex("A".repeat(64))).toBe(false); // lowercase only for check
    expect(isSha256Hex("abc")).toBe(false);
  });
});

describe("OCR field map", () => {
  test("national_id_card defaults", () => {
    const f = mapOcrFields("national_id_card");
    expect(f.name).toBeTruthy();
    expect(f.nationalId).toHaveLength(10);
  });

  test("stub text overrides", () => {
    const f = mapOcrFields("birth_certificate", "name:کاوه|کدملی:0099009900");
    expect(f.name).toBe("کاوه");
    expect(f.nationalId).toBe("0099009900");
  });

  test("accident_sketch has plates", () => {
    const f = mapOcrFields("accident_sketch");
    expect(f.plateA).toBeTruthy();
    expect(f.sketchRef).toBeTruthy();
  });
});

describe("archiveCustomerKey", () => {
  test("prefixes bare holder digits with C-K", async () => {
    const { archiveCustomerKey } = await import("./dms");
    expect(archiveCustomerKey("825221")).toBe("C-K825221");
    expect(archiveCustomerKey("C-K825221")).toBe("C-K825221");
    expect(archiveCustomerKey("Dossier-DEMO-3045")).toBe("Dossier-DEMO-3045");
    expect(archiveCustomerKey("")).toBe("");
  });
});
