import { describe, expect, test } from "bun:test";
import {
  RIBBON_KINDS,
  cssVariationVars,
  hashSeed,
  mulberry32,
  sceneVariation,
} from "./scene-variation";

describe("scene micro-variation", () => {
  test("hashSeed is stable", () => {
    expect(hashSeed("dashboard-kpi")).toBe(hashSeed("dashboard-kpi"));
    expect(hashSeed("login-hero")).not.toBe(hashSeed("dashboard-kpi"));
  });

  test("same seed+index yields the same ribbon and timings", () => {
    const a = sceneVariation(42, 0);
    const b = sceneVariation(42, 0);
    expect(a).toEqual(b);
    expect(RIBBON_KINDS).toContain(a.ribbon);
  });

  test("adjacent indices are not clones", () => {
    const a = sceneVariation(99, 0);
    const b = sceneVariation(99, 1);
    const c = sceneVariation(99, 2);
    expect(`${a.ribbon}:${a.delayMs}:${a.tiltY}`).not.toBe(`${b.ribbon}:${b.delayMs}:${b.tiltY}`);
    expect(`${b.ribbon}:${b.delayMs}:${b.tiltY}`).not.toBe(`${c.ribbon}:${c.delayMs}:${c.tiltY}`);
  });

  test("css vars are unit-suffixed custom properties", () => {
    const vars = cssVariationVars(sceneVariation(7, 3));
    expect(vars["--l3d-delay"]).toMatch(/ms$/);
    expect(vars["--l3d-duration"]).toMatch(/ms$/);
    expect(vars["--l3d-tilt-x"]).toMatch(/deg$/);
  });

  test("mulberry32 is deterministic", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });
});
