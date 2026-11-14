import { describe, expect, test } from "bun:test";
import {
  IRANPAYAMAK_DEFAULT_BASE,
  SMS_ENV_NEEDED,
  buildInstallmentReminderText,
  buildRenewalReminderText,
  normalizeMobile,
} from "./sms";

describe("Iran Payamak SMS helpers", () => {
  test("env/API missing message is Persian and has no secret", () => {
    expect(SMS_ENV_NEEDED).toBe("نیاز به env / API");
    expect(SMS_ENV_NEEDED.toLowerCase()).not.toContain("password");
    expect(SMS_ENV_NEEDED.toLowerCase()).not.toContain("token");
    expect(SMS_ENV_NEEDED.toLowerCase()).not.toContain("api_key");
  });

  test("default public base is iranpayamak, not a credential", () => {
    expect(IRANPAYAMAK_DEFAULT_BASE).toBe("https://api.iranpayamak.com");
  });

  test("reminder texts stay generic and named", () => {
    expect(buildInstallmentReminderText("فاطمه")).toContain("فاطمه");
    expect(buildInstallmentReminderText("فاطمه")).toContain("قسط");
    expect(buildRenewalReminderText("علی")).toContain("تمدید");
  });
});

describe("normalizeMobile", () => {
  test("accepts local, +98, and Persian digits", () => {
    expect(normalizeMobile("09121234567")).toBe("09121234567");
    expect(normalizeMobile("+989121234567")).toBe("09121234567");
    expect(normalizeMobile("۹۱۲۱۲۳۴۵۶۷")).toBe("09121234567");
    expect(normalizeMobile("  0912 123 4567 ")).toBe("09121234567");
  });

  test("rejects empty or too-short values without inventing digits", () => {
    expect(normalizeMobile("")).toBe("");
    expect(normalizeMobile("123")).toBe("");
    expect(normalizeMobile("—")).toBe("");
  });
});
