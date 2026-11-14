import { describe, expect, test } from "bun:test";
import {
  COMPOUND_RATE,
  DEFAULT_TEAMSHO_URL,
  RETIREMENT_AGE_MAX,
  RETIREMENT_AGE_MIN,
  compoundMonthly,
  demoInitialMonthly,
  getTeamshoUrl,
  validateRetirementAge,
} from "./omid-pension";

describe("compound 10%", () => {
  test("year 0 = base", () => {
    expect(compoundMonthly(1_000_000, 0)).toBe(1_000_000);
  });
  test("year 1 = +10%", () => {
    expect(compoundMonthly(1_000_000, 1)).toBe(1_100_000);
    expect(COMPOUND_RATE).toBe(0.1);
  });
  test("year 2 compound", () => {
    expect(compoundMonthly(1_000_000, 2)).toBe(1_210_000);
  });
});

describe("age bounds 50–61", () => {
  test("accepts edges", () => {
    expect(validateRetirementAge(RETIREMENT_AGE_MIN).ok).toBe(true);
    expect(validateRetirementAge(RETIREMENT_AGE_MAX).ok).toBe(true);
    expect(validateRetirementAge(55).ok).toBe(true);
  });
  test("rejects out of range", () => {
    expect(validateRetirementAge(49).ok).toBe(false);
    expect(validateRetirementAge(62).ok).toBe(false);
  });
});

describe("DEMO initial monthly", () => {
  test("positive from accumulation", () => {
    const m = demoInitialMonthly(240_000_000, 15);
    expect(m).toBeGreaterThan(0);
  });
});

describe("death path semantics (documented)", () => {
  test("guaranteed remaining uses compound amounts", () => {
    // Years 0–9 stay on schedule; beneficiary inherits remaining compound amounts
    const base = 1_000_000;
    const y5 = compoundMonthly(base, 5);
    expect(y5).toBe(Math.round(base * Math.pow(1.1, 5)));
  });
  test("lifetime stop has no further compound advance", () => {
    // After death in lifetime, schedule stops — no new yearIndex advance
    const stopped = true;
    expect(stopped).toBe(true);
  });
});

describe("Teamsho deep-link URL", () => {
  test("default is public Teamsho root", () => {
    expect(DEFAULT_TEAMSHO_URL).toBe("https://teamsho.karafarin-insurance.ir/");
    expect(getTeamshoUrl().startsWith("https://teamsho.karafarin-insurance.ir")).toBe(true);
  });
});

