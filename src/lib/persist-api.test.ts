import { describe, expect, test } from "bun:test";
import {
  documentCustomerKey,
  documentCustomerKeyAliases,
  docDisplayTitle,
  resolvePolicyholderCode,
} from "./persist-api";

describe("resolvePolicyholderCode", () => {
  test("prefers holderCode bare", () => {
    expect(resolvePolicyholderCode({ id: "1", holderCode: "825221" })).toBe("825221");
  });
  test("falls back to id", () => {
    expect(resolvePolicyholderCode({ id: "825221" })).toBe("825221");
  });
  test("strips C-K from id for PATCH key", () => {
    expect(resolvePolicyholderCode({ id: "C-K825221", holderCode: "" })).toBe("825221");
  });
});

describe("documentCustomerKey C-K FACT", () => {
  test("bare holder → C-K{holder}", () => {
    expect(documentCustomerKey({ id: "x", holderCode: "825221" })).toBe("C-K825221");
  });
  test("keeps existing C-K id", () => {
    expect(documentCustomerKey({ id: "C-K825221", holderCode: "825221" })).toBe("C-K825221");
  });
  test("aliases include C-K and bare", () => {
    const a = documentCustomerKeyAliases({ id: "C-825221", holderCode: "825221" });
    expect(a[0]).toBe("C-K825221");
    expect(a).toContain("825221");
  });
});

describe("docDisplayTitle", () => {
  test("prefers title then fileTitle", () => {
    expect(docDisplayTitle({ id: 1, title: "الف" })).toBe("الف");
    expect(docDisplayTitle({ id: 1, fileTitle: "ب" })).toBe("ب");
  });
});
