import { describe, expect, test } from "bun:test";
import {
  DEMO_RATES,
  SHOP_IFRAME_ALLOWED,
  SHOP_OPEN_LABEL,
  SHOP_URL,
  earlyPayPoints,
  findCouponRule,
  sortLeaderboard,
  daysEarly,
} from "./loyalty";

describe("early pay points", () => {
  test("5 days early → max(flat, 5*perDay)", () => {
    const r = earlyPayPoints("1404/06/01", "1404/06/06");
    expect(r.eligible).toBe(true);
    expect(r.daysEarly).toBe(5);
    expect(r.points).toBe(Math.max(DEMO_RATES.early_pay_flat, 5 * DEMO_RATES.early_pay_per_day));
  });

  test("late pay not eligible", () => {
    const r = earlyPayPoints("1404/06/10", "1404/06/06");
    expect(r.eligible).toBe(false);
    expect(r.points).toBe(0);
  });

  test("daysEarly helper", () => {
    expect(daysEarly("1404/01/01", "1404/01/11")).toBe(10);
    expect(daysEarly("bad", "1404/01/01")).toBeNull();
  });
});

describe("coupon issue rule", () => {
  test("universal_life → fire 20%", () => {
    const rule = findCouponRule("universal_life");
    expect(rule).toBeTruthy();
    expect(rule!.discountPercent).toBe(20);
    expect(rule!.couponInsuranceType).toBe("fire");
  });

  test("omid_retirement triggers", () => {
    expect(findCouponRule("omid_retirement")).toBeTruthy();
  });

  test("third_party_auto does not invent coupon", () => {
    expect(findCouponRule("third_party_auto")).toBeNull();
  });
});

describe("leaderboard sort", () => {
  test("sorts by points desc and assigns rank", () => {
    const board = sortLeaderboard([
      { agentCode: "B", points: 100 },
      { agentCode: "A", points: 300 },
      { agentCode: "C", points: 200 },
    ]);
    expect(board.map((r) => r.agentCode)).toEqual(["A", "C", "B"]);
    expect(board.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  test("tie-break by agentCode", () => {
    const board = sortLeaderboard([
      { agentCode: "Z", points: 50 },
      { agentCode: "A", points: 50 },
    ]);
    expect(board[0].agentCode).toBe("A");
    expect(board[0].rank).toBe(1);
  });
});

describe("shop deep-link", () => {
  test("public shop URL + iframe blocked + open label", () => {
    expect(SHOP_URL).toBe("https://shop.karafarin-insurance.ir/");
    expect(SHOP_IFRAME_ALLOWED).toBe(false);
    expect(SHOP_OPEN_LABEL).toBe("باز کردن فروشگاه");
  });
});
