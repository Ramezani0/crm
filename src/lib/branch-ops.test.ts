import { describe, expect, test } from "bun:test";
import {
  calcVariance,
  expandSerialRange,
  directionLabel,
  kindLabel,
} from "./branch-ops";

describe("expandSerialRange", () => {
  test("expands inclusive receipt range", () => {
    const r = expandSerialRange("receipt", "REC-1001", "REC-1003");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.serials).toEqual(["REC-1001", "REC-1002", "REC-1003"]);
    }
  });

  test("rejects bad kind", () => {
    const r = expandSerialRange("sticker", "1", "2");
    expect(r.ok).toBe(false);
  });

  test("rejects inverted range", () => {
    const r = expandSerialRange("hologram", "HOLO-10", "HOLO-5");
    expect(r.ok).toBe(false);
  });
});

describe("calcVariance", () => {
  test("agency higher", () => {
    const c = calcVariance(1_000_000, 900_000);
    expect(c.ok).toBe(true);
    expect(c.variance).toBe(100_000);
    expect(c.direction).toBe("agency_higher");
    expect(directionLabel(c.direction!)).toContain("نمایندگی");
  });

  test("matched", () => {
    const c = calcVariance(500, 500);
    expect(c.direction).toBe("matched");
    expect(c.variance).toBe(0);
  });

  test("branch higher", () => {
    const c = calcVariance(100, 250);
    expect(c.direction).toBe("branch_higher");
    expect(c.variance).toBe(-150);
  });
});

describe("labels", () => {
  test("kindLabel hologram", () => {
    expect(kindLabel("hologram")).toBe("هولوگرام");
  });
});
