import { describe, expect, test } from "bun:test";
import { SITE_CHANGE_NOTIFY_MOBILE } from "./essential-sms";
import { STAFF_LOGIN_NOTIFY_ENABLED, formatSiteChangeSms } from "./site-notify";

describe("site change notify", () => {
  test("locks the notify number and formats a Persian summary", () => {
    expect(SITE_CHANGE_NOTIFY_MOBILE).toBe("09138917291");
    expect(formatSiteChangeSms("customer_create", "ثبت مشتری")).toContain("مشتری جدید");
    expect(formatSiteChangeSms("policy_edit", "پیش‌نویس")).toContain("ویرایش بیمه‌نامه");
    expect(formatSiteChangeSms("settings_save", "")).toBe("");
  });

  test("staff login hook stays off until staff auth is live", () => {
    expect(STAFF_LOGIN_NOTIFY_ENABLED).toBe(false);
    expect(formatSiteChangeSms("staff_login", "ceo")).toContain("ورود کارکنان");
  });
});
