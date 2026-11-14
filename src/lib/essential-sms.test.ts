import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ESSENTIAL_STATUS,
  ESSENTIAL_TASK_STATUSES,
  SMS_INBOUND_WHITELIST,
  essentialTaskFromSms,
  isWhitelistedMobile,
  mergeEssentialTasks,
} from "./essential-sms";

describe("inbound SMS whitelist", () => {
  test("accepts only the locked numbers", () => {
    expect(SMS_INBOUND_WHITELIST).toEqual([
      "09138917291",
      "09180089780",
      "09133938543",
      "09386674005",
      "09213908576",
      "09120973209",
    ]);
    expect(isWhitelistedMobile("09138917291")).toBe(true);
    expect(isWhitelistedMobile("+989180089780")).toBe(true);
    expect(isWhitelistedMobile("09120000000")).toBe(false);
  });

  test("builds a نشد essential task from a whitelist sender", () => {
    const t = essentialTaskFromSms({
      from: "09133938543",
      body: "پیگیری قسط معوق",
      at: "2026-09-11T08:00:00Z",
    });
    expect(t?.status).toBe("نشد");
    expect(t?.status).toBe(DEFAULT_ESSENTIAL_STATUS);
    expect(t?.from).toBe("09133938543");
    expect(essentialTaskFromSms({ from: "09121111111", body: "nope" })).toBeNull();
  });

  test("statuses are the locked Persian labels", () => {
    expect(ESSENTIAL_TASK_STATUSES).toEqual(["انجام‌شد", "نشد", "درحال‌انجام"]);
  });
});

describe("mergeEssentialTasks", () => {
  test("keeps existing status and ignores duplicate ids", () => {
    const first = essentialTaskFromSms({ from: "09138917291", body: "a", id: "1" })!;
    const updated = { ...first, status: "انجام‌شد" as const };
    const again = essentialTaskFromSms({ from: "09138917291", body: "a", id: "1" })!;
    const next = mergeEssentialTasks([updated], [again]);
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("انجام‌شد");
  });
});
