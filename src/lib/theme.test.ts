import { describe, expect, test } from "bun:test";
import { DEFAULT_THEME, THEME_BOOT_SCRIPT, THEME_STORAGE_KEY, parseTheme } from "./theme";

describe("theme persistence", () => {
  test("uses the locked localStorage key", () => {
    expect(THEME_STORAGE_KEY).toBe("fasihi-theme");
  });

  test("defaults to dark agency console", () => {
    expect(DEFAULT_THEME).toBe("dark");
    expect(parseTheme(null)).toBe("dark");
    expect(parseTheme("nope")).toBe("dark");
  });

  test("accepts only dark and light", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
  });

  test("boot script reads the storage key before paint", () => {
    expect(THEME_BOOT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_BOOT_SCRIPT).toContain("localStorage");
  });
});

describe("DESIGN_EMERALD_GOLD tokens", () => {
  test("styles.css locks emerald #007440 and gold #FCBC00 on light and dark", async () => {
    const css = await Bun.file("src/styles.css").text();
    expect(css).toContain("--brand-emerald: #007440");
    expect(css).toContain("--brand-gold: #fcbc00");
    expect(css).toContain("--background: #f4efe0");
    expect(css).toContain("--title: #8f6e12");
    expect(css).toContain(".title-extrude");
  });
});
