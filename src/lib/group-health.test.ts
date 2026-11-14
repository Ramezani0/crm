import { describe, expect, test } from "bun:test";
import {
  DEFAULT_FRANCHISE_PCT,
  PRODUCT_CODE,
  checkWaitingBlock,
  computeClaimPayout,
  remainingCeiling,
} from "./group-health";

describe("ceiling remaining", () => {
  test("basic subtract", () => {
    expect(remainingCeiling(200_000_000, 20_000_000)).toBe(180_000_000);
  });
  test("floors at zero", () => {
    expect(remainingCeiling(10, 50)).toBe(0);
  });
});

describe("franchise deduct", () => {
  test("10% of net", () => {
    const c = computeClaimPayout(10_000_000, 0, DEFAULT_FRANCHISE_PCT, 50_000_000);
    expect(c.franchiseRial).toBe(1_000_000);
    expect(c.payoutRial).toBe(9_000_000);
  });
  test("capped by remaining sublimit", () => {
    const c = computeClaimPayout(10_000_000, 0, 10, 5_000_000);
    expect(c.payoutRial).toBe(5_000_000);
  });
  test("basic share then franchise", () => {
    const c = computeClaimPayout(10_000_000, 2_000_000, 10, 100_000_000);
    expect(c.franchiseRial).toBe(800_000);
    expect(c.payoutRial).toBe(7_200_000);
  });
});

describe("waiting block", () => {
  test("blocks when short", () => {
    const b = checkWaitingBlock(5, 90);
    expect(b.blocked).toBe(true);
    expect(b.remainingWaitDays).toBe(85);
  });
  test("passes when enough days", () => {
    expect(checkWaitingBlock(100, 90).blocked).toBe(false);
  });
});

describe("product_code Eng-extension", () => {
  test("uses product_code not locked insurance_type", () => {
    expect(PRODUCT_CODE).toBe("group_health");
  });
});

describe("tariff match stub semantics", () => {
  test("payout uses approved tariff after franchise", () => {
    // GH-D-310 approved 1.8M DEMO
    const c = computeClaimPayout(1_800_000, 0, 10, 15_000_000);
    expect(c.franchiseRial).toBe(180_000);
    expect(c.payoutRial).toBe(1_620_000);
  });
});
