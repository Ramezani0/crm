import { describe, expect, test } from "bun:test";
import {
  LEGAL_ENTITY_ID_LABEL,
  displayHolderCode,
  displayLegalEntityId,
  formatDate,
  isInRenewalWindow,
  jalaliToGregorian,
  parseDate,
  parseJalaliYearMonth,
  relativeDays,
} from "./format";

describe("formatDate", () => {
  test("returns dash for empty or invalid dates", () => {
    expect(formatDate("")).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });

  test("displays live Jalali slash dates as 4-digit 14xx, not 3-digit Intl years", () => {
    expect(formatDate("1404/07/08")).toBe("۱۴۰۴/۰۷/۰۸");
    expect(formatDate("1404-04-19")).toBe("۱۴۰۴/۰۴/۱۹");
    expect(formatDate("۱۴۰۴/۱۱/۱۰")).toBe("۱۴۰۴/۱۱/۱۰");
    expect(formatDate("798/07/08")).toBe("—");
    expect(formatDate("1404/07/08")).not.toContain("۷۸۲");
    expect(formatDate("1404/07/08")).not.toContain("۷۹۸");
    expect(formatDate("1404/07/08")).not.toContain("۸۱۹");
  });

  test("still converts Gregorian ISO through the Persian calendar", () => {
    expect(formatDate("2025-03-21")).toBe("۱۴۰۴/۰۱/۰۱");
    expect(formatDate("2026-03-21")).toContain("۱۴۰۵");
  });
});

describe("parseJalaliYearMonth", () => {
  test("reads Jalali end dates used by policy filters", () => {
    expect(parseJalaliYearMonth("۱۴۰۵/۰۶/۰۲")).toEqual({ year: 1405, month: 6 });
  });

  test("converts Gregorian end dates to the Jalali month", () => {
    expect(parseJalaliYearMonth("2026-03-21")).toEqual({ year: 1405, month: 1 });
    expect(parseJalaliYearMonth("")).toBeNull();
  });
});

describe("parseDate", () => {
  test("accepts Jalali YYYY/MM/DD and YYYY-MM-DD with a 4-digit year", () => {
    expect(parseDate("1404/04/19")?.toISOString().slice(0, 10)).toBe("2025-07-10");
    expect(parseDate("1404-04-19")?.toISOString().slice(0, 10)).toBe("2025-07-10");
    expect(parseDate("۱۴۰۴/۰۱/۰۱")?.toISOString().slice(0, 10)).toBe("2025-03-21");
    expect(parseDate("")).toBeNull();
    expect(parseDate("not-a-date")).toBeNull();
  });

  test("still parses Gregorian ISO dates", () => {
    expect(parseDate("2026-09-11")?.toISOString().slice(0, 10)).toBe("2026-09-11");
    expect(parseDate("2026-09-11T00:00:00+00:00")?.toISOString().slice(0, 10)).toBe("2026-09-11");
  });
});

describe("jalaliToGregorian", () => {
  test("converts Nowruz anchors used by live endDate math", () => {
    expect(jalaliToGregorian(1404, 1, 1)).toEqual([2025, 3, 21]);
    expect(jalaliToGregorian(1403, 1, 1)).toEqual([2024, 3, 20]);
  });
});

describe("relativeDays", () => {
  test("returns NaN for invalid dates so filters can skip them", () => {
    expect(Number.isNaN(relativeDays("", new Date("2026-09-11T00:00:00Z")))).toBe(true);
  });

  test("computes a renewals window from live Jalali endDate strings", () => {
    const from = new Date("2025-07-01T00:00:00.000Z");
    expect(relativeDays("1404/04/19", from)).toBe(9);
    expect(isInRenewalWindow("1404/04/19", from, 45)).toBe(true);
    expect(isInRenewalWindow("1404/01/01", from, 45)).toBe(false);
    expect(isInRenewalWindow("1405/06/01", from, 45)).toBe(false);
    expect(isInRenewalWindow("", from, 45)).toBe(false);
  });

  test("keeps Gregorian ISO windows used by dossier tests", () => {
    const today = new Date("2026-09-11T00:00:00.000Z");
    expect(relativeDays("2026-10-01", today)).toBe(20);
    expect(isInRenewalWindow("2026-10-01", today, 45)).toBe(true);
  });
});


describe("renewals timezone skew", () => {
  test("Jalali endDate in API asOf window can fall outside client window one UTC day later", () => {
    const apiAsOf = new Date("2026-09-16T00:00:00.000Z");
    const clientToday = new Date("2026-09-17T00:00:00.000Z");
    // 1405/06/25 == 2026-09-16
    expect(relativeDays("1405/06/25", apiAsOf)).toBe(0);
    expect(isInRenewalWindow("1405/06/25", apiAsOf, 45)).toBe(true);
    expect(relativeDays("1405/06/25", clientToday)).toBe(-1);
    expect(isInRenewalWindow("1405/06/25", clientToday, 45)).toBe(false);
  });
});

describe("displayHolderCode", () => {
  test("shows Persian digits for a real holder_code and dash when empty", () => {
    expect(displayHolderCode("88012")).toBe("۸۸۰۱۲");
    expect(displayHolderCode("")).toBe("—");
    expect(displayHolderCode(undefined)).toBe("—");
  });
});

describe("displayLegalEntityId", () => {
  test("uses the Persian label only", () => {
    expect(LEGAL_ENTITY_ID_LABEL).toBe("شناسه حقوقی");
    expect(LEGAL_ENTITY_ID_LABEL.toLowerCase()).not.toContain("legal");
  });

  test("shows an em dash when empty or null", () => {
    expect(displayLegalEntityId("")).toBe("—");
    expect(displayLegalEntityId("   ")).toBe("—");
    expect(displayLegalEntityId(null)).toBe("—");
    expect(displayLegalEntityId(undefined)).toBe("—");
  });

  test("keeps the identifier text and leading zeros", () => {
    expect(displayLegalEntityId("10630093308")).toBe("10630093308");
    expect(displayLegalEntityId("01063009330")).toBe("01063009330");
  });
});
