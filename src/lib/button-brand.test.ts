import { describe, expect, test } from "bun:test";
import {
  BRAND_BUTTON_FLASH_TONES,
  BUTTON_FLASH_MS,
  BUTTON_HOVER_MS,
  isCtaButtonVariant,
  pickBrandButtonFlashTone,
} from "./button-brand";

describe("brand button flash palette", () => {
  test("click flash is gold / emerald / forest (DESIGN_EMERALD_GOLD.md)", () => {
    expect([...BRAND_BUTTON_FLASH_TONES]).toEqual(["gold", "emerald", "forest"]);
  });

  test("never includes danger", () => {
    expect(BRAND_BUTTON_FLASH_TONES).not.toContain("destructive");
    expect(BRAND_BUTTON_FLASH_TONES).not.toContain("red");
  });

  test("picker only returns brand tones", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(pickBrandButtonFlashTone());
    for (const tone of seen) {
      expect(BRAND_BUTTON_FLASH_TONES).toContain(tone);
    }
  });

  test("hover is ~150ms and click flash is ~200ms", () => {
    expect(BUTTON_HOVER_MS).toBe(150);
    expect(BUTTON_FLASH_MS).toBe(200);
  });
});

describe("CTA button variant scope", () => {
  test("includes primary CTA variants", () => {
    expect(isCtaButtonVariant(undefined)).toBe(true);
    expect(isCtaButtonVariant("default")).toBe(true);
    expect(isCtaButtonVariant("secondary")).toBe(true);
    expect(isCtaButtonVariant("outline")).toBe(true);
  });

  test("excludes danger, ghost, and link chrome", () => {
    expect(isCtaButtonVariant("destructive")).toBe(false);
    expect(isCtaButtonVariant("ghost")).toBe(false);
    expect(isCtaButtonVariant("link")).toBe(false);
  });
});
