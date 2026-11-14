import { describe, expect, test } from "bun:test";
import { normalizeMobile } from "./phone";

describe("normalizeMobile", () => {
  test("accepts 09xxxxxxxxx and persian digits", () => {
    expect(normalizeMobile("09121234567")).toBe("09121234567");
    expect(normalizeMobile("۰۹۱۲۱۲۳۴۵۶۷")).toBe("09121234567");
  });

  test("normalizes +98 and 9xxxxxxxxx", () => {
    expect(normalizeMobile("+989121234567")).toBe("09121234567");
    expect(normalizeMobile("9121234567")).toBe("09121234567");
  });

  test("rejects short or landline numbers", () => {
    expect(normalizeMobile("02188554433")).toBe("");
    expect(normalizeMobile("")).toBe("");
  });
});
