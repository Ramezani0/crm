import { describe, expect, test } from "bun:test";
import {
  DIYA_1405_VERIFIED,
  DIYA_DEFAULT_YEAR,
  LIFE_RATES,
  RETIREMENT_RATE,
  endorsementIncreaseNote,
  inferProductFromKind,
  resolveLadderP0,
  isLifeRate,
  isPremiumLadderKind,
  parseJalaliYear,
  premiumAtYear,
  premiumSchedule,
  rateForProduct,
  rateFromAdjPct,
  rialToToman,
  totalPremiums,
  yearsThroughTarget,
} from "./premium-adjustment";

describe("premiumAtYear — locked formula P_n = P_0 * (1+r)^(n-1)", () => {
  test("year 1 equals P0", () => {
    expect(premiumAtYear(10_000_000, 0.1, 1)).toBe(10_000_000);
  });

  test("docs example: P0=10_000_000, r=0.10, n=5 → 14_641_000", () => {
    expect(premiumAtYear(10_000_000, 0.1, 5)).toBe(14_641_000);
  });

  test("r=0 keeps premium flat", () => {
    expect(premiumAtYear(5_000_000, 0, 8)).toBe(5_000_000);
  });

  test("guards invalid inputs", () => {
    expect(premiumAtYear(-1, 0.1, 2)).toBe(0);
    expect(premiumAtYear(100, 0.1, 0)).toBe(0);
    expect(premiumAtYear(100, -0.1, 2)).toBe(0);
  });
});

describe("premiumSchedule + jalaliYear", () => {
  test("default startYear 1405 — jalaliYear primary calendar label", () => {
    const rows = premiumSchedule(10_000_000, 0.1, 3);
    expect(rows).toEqual([
      { year: 1, jalaliYear: 1405, premiumRial: 10_000_000, premiumToman: 1_000_000 },
      { year: 2, jalaliYear: 1406, premiumRial: 11_000_000, premiumToman: 1_100_000 },
      { year: 3, jalaliYear: 1407, premiumRial: 12_100_000, premiumToman: 1_210_000 },
    ]);
  });

  test("custom startYear shifts jalaliYear", () => {
    const rows = premiumSchedule(1_000_000, 0, 2, 1400);
    expect(rows[0]).toEqual({
      year: 1,
      jalaliYear: 1400,
      premiumRial: 1_000_000,
      premiumToman: 100_000,
    });
    expect(rows[1].jalaliYear).toBe(1401);
  });

  test("empty for non-positive years", () => {
    expect(premiumSchedule(1, 0.1, 0)).toEqual([]);
  });
});

describe("product rates", () => {
  test("retirement locks r=0.10", () => {
    expect(rateForProduct("retirement", 0.25)).toBe(RETIREMENT_RATE);
    expect(RETIREMENT_RATE).toBe(0.1);
  });

  test("life accepts Excel set including 5% and 30%", () => {
    expect(LIFE_RATES).toEqual([0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]);
    expect(isLifeRate(0.05)).toBe(true);
    expect(isLifeRate(0.3)).toBe(true);
    expect(isLifeRate(0.12)).toBe(false);
    expect(rateForProduct("life", 0.15)).toBe(0.15);
  });

  test("inferProductFromKind", () => {
    expect(inferProductFromKind("امید بازنشستگی")).toBe("retirement");
    expect(inferProductFromKind("omid_retirement")).toBe("retirement");
    expect(inferProductFromKind("عمر و سرمایه‌گذاری")).toBe("life");
    expect(inferProductFromKind("universal_life")).toBe("life");
  });

  test("isPremiumLadderKind English + Persian", () => {
    expect(isPremiumLadderKind("universal_life")).toBe(true);
    expect(isPremiumLadderKind("omid_retirement")).toBe(true);
    expect(isPremiumLadderKind("عمر و سرمایه‌گذاری")).toBe(true);
    expect(isPremiumLadderKind("امید بازنشستگی")).toBe(true);
    expect(isPremiumLadderKind("شخص ثالث")).toBe(false);
  });

  test("rateFromAdjPct — life percent and retirement lock", () => {
    expect(rateFromAdjPct("life", 10)).toBe(0.1);
    expect(rateFromAdjPct("life", 0.15)).toBe(0.15);
    expect(rateFromAdjPct("retirement", undefined)).toBe(0.1);
    expect(rateFromAdjPct("retirement", 25)).toBe(0.1);
  });
});

describe("money helpers", () => {
  test("rialToToman", () => {
    expect(rialToToman(10)).toBe(1);
    expect(rialToToman(15)).toBe(2);
  });

  test("totalPremiums sums schedule", () => {
    expect(totalPremiums(10_000_000, 0.1, 3)).toBe(33_100_000);
  });
});

describe("diya ۱۴۰۵ VERIFIED — قوه قضاییه (not claim)", () => {
  test("default UI year is 1405", () => {
    expect(DIYA_DEFAULT_YEAR).toBe(1405);
    expect(DIYA_1405_VERIFIED.year).toBe(1405);
  });

  test("VERIFIED amounts in Rial and Toman", () => {
    expect(DIYA_1405_VERIFIED.status).toBe("VERIFIED");
    expect(DIYA_1405_VERIFIED.sourceLabel).toBe("قوه قضاییه");
    expect(DIYA_1405_VERIFIED.ordinaryRial).toBe(21_000_000_000);
    expect(DIYA_1405_VERIFIED.haramRial).toBe(28_000_000_000);
    expect(DIYA_1405_VERIFIED.ordinaryToman).toBe(2_100_000_000);
    expect(DIYA_1405_VERIFIED.haramToman).toBe(2_800_000_000);
    expect(DIYA_1405_VERIFIED.thirdPartyPropertyMinRial).toBe(700_000_000);
    expect(DIYA_1405_VERIFIED.thirdPartyPropertyMinToman).toBe(70_000_000);
  });

  test("Toman equals Rial/10", () => {
    expect(DIYA_1405_VERIFIED.ordinaryToman).toBe(DIYA_1405_VERIFIED.ordinaryRial / 10);
    expect(DIYA_1405_VERIFIED.haramToman).toBe(DIYA_1405_VERIFIED.haramRial / 10);
  });
});

describe("Amir P1 sample — start 1388 · P0=2e6 · r=0.10 → 1405 = 10_108_941", () => {
  test("premiumAtYear n=18", () => {
    expect(premiumAtYear(2_000_000, 0.1, 18)).toBe(10_108_941);
  });

  test("premiumSchedule startYear 1388 years through 1405", () => {
    const startYear = 1388;
    const years = yearsThroughTarget(startYear, 1405);
    expect(years).toBe(18);
    const rows = premiumSchedule(2_000_000, 0.1, years, startYear);
    expect(rows[0]).toEqual({
      year: 1,
      jalaliYear: 1388,
      premiumRial: 2_000_000,
      premiumToman: 200_000,
    });
    const row1405 = rows.find((r) => r.jalaliYear === 1405);
    expect(row1405).toBeDefined();
    expect(row1405!.year).toBe(18);
    expect(row1405!.premiumRial).toBe(10_108_941);
  });

  test("parseJalaliYear from start_date", () => {
    expect(parseJalaliYear("1388/03/15")).toBe(1388);
    expect(parseJalaliYear("")).toBeNull();
  });

  test("endorsementIncreaseNote surfaces keys only", () => {
    expect(endorsementIncreaseNote(undefined)).toBeNull();
    expect(endorsementIncreaseNote({ plan: "A" })).toBeNull();
    const note = endorsementIncreaseNote({
      "شماره الحاقيه": "12",
      "نوع تغيير": "افزایش",
    });
    expect(note).toContain("شماره الحاقيه");
    expect(note).not.toMatch(/\d{7,}/); // no invented large amounts
  });
});

describe("resolveLadderP0 — start IP only (Amir LOCK)", () => {
  test("uses initialPremiumStart when >0 (holder 1838500 UL sample)", () => {
    const r = resolveLadderP0({
      initialPremiumStart: 4_000_000,
      initialPremium: 20_000_000,
    });
    expect(r.p0).toBe(4_000_000);
    expect(r.source).toBe("start");
    expect(r.warning).toBeNull();
    expect(r.latestPremium).toBe(20_000_000);
  });

  test("extras.initialPremiumStart / snake alias", () => {
    expect(
      resolveLadderP0({
        initialPremium: 30_000_000,
        extras: { initialPremiumStart: "7000000" },
      }).p0,
    ).toBe(7_000_000);
    expect(
      resolveLadderP0({
        extras: { initial_premium_start: "4000000" },
      }).p0,
    ).toBe(4_000_000);
  });

  test("missing start — no auto from latest endorsement", () => {
    const r = resolveLadderP0({ initialPremium: 20_000_000 });
    expect(r.p0).toBeNull();
    expect(r.source).toBe("none");
    expect(r.warning).toMatch(/شروع/);
    expect(r.latestPremium).toBe(20_000_000);
  });

  test("omid-style equal start+latest still prefers start field", () => {
    const r = resolveLadderP0({
      initialPremiumStart: 60_000_000,
      initialPremium: 60_000_000,
    });
    expect(r.p0).toBe(60_000_000);
    expect(r.source).toBe("start");
  });
});
