import { describe, expect, test } from "bun:test";
import { BRAND, LUX_ART, LUX_DIR } from "./brand";
import { CUBE_ICON_KINDS, CUBE_ICON_LAYOUT } from "@/components/emblem/cube-icons";

describe("login copy lock", () => {
  test("keeps CRM فصیحی as the product title", () => {
    expect(BRAND.title).toBe("CRM فصیحی");
  });

  test("locks agency / manager / code lines for the login surface", () => {
    expect(BRAND.loginAgency).toBe("نمایندگی خانم فاطمه فصیحی");
    expect(BRAND.loginManager).toBe("امیرحسین رمضانی راد");
    expect(BRAND.loginCodeLine).toBe("کد ۳۰۴۵");
    expect(BRAND.agencyCodeFa).toBe("۳۰۴۵");
  });

  test("login route renders the locked copy and not Three.js", async () => {
    const page = await Bun.file("src/routes/index.tsx").text();
    expect(page).toContain("BRAND.loginAgency");
    expect(page).toContain("BRAND.loginManager");
    expect(page).toContain("title-extrude");
    expect(page).toContain("LoginBrandLockup");
    expect(page).toContain("LoginCopyCards");
    const lockup = await Bun.file("src/components/login-brand-lockup.tsx").text();
    expect(lockup).toContain("BRAND.agencyCode");
    expect(lockup).not.toContain("BRAND.loginCodeLine");
    expect(lockup).not.toContain("bg-background/55");
    expect(lockup).toContain("fixed start-4 top-4");
    const cards = await Bun.file("src/components/login-copy-cards.tsx").text();
    expect(cards).toContain("LUX_ART.badgeCode");
    expect(cards).toContain("LUX_ART.ramezani");
    expect(cards).toContain("LUX_ART.fasihi");
    expect(cards).toContain("LUX_ART.code3045");
    expect(cards).toContain("LUX_ART.brandType");
    expect(page).not.toContain("@react-three");
    expect(page).not.toMatch(/from ["']three["']/);
  });
});

describe("lux art pack", () => {
  test("wires stills under /assets/lux/", () => {
    expect(LUX_DIR).toBe("/assets/lux");
    expect(LUX_ART.logo).toBe("/assets/lux/00-logo-source-karafarin.png");
    expect(LUX_ART.cubeUmbrella).toBe("/assets/lux/03-cube-umbrella.png");
    expect(LUX_ART.dashboard).toBe("/assets/lux/08-dashboard-automation.png");
    expect(LUX_ART.lineCards).toBe("/assets/lux/09-line-cards.png");
    expect(LUX_ART.ramezani).toBe("/assets/lux/13-lux3d-ramezani.png");
    expect(LUX_ART.fasihi).toBe("/assets/lux/14-lux3d-fasihi.png");
    expect(LUX_ART.code3045).toBe("/assets/lux/15-lux3d-code3045.png");
    expect(LUX_ART.auto).toBe("/assets/lux/16-auto-insurance.png");
    expect(LUX_ART.life).toBe("/assets/lux/17-life-health.png");
    expect(LUX_ART.family).toBe("/assets/lux/18-family-umbrella.png");
    expect(LUX_ART.fire).toBe("/assets/lux/19-fire-property.png");
    expect(LUX_ART.travel).toBe("/assets/lux/20-travel.png");
    expect(LUX_ART.installments).toBe("/assets/lux/21-installments.png");
    expect(LUX_ART.home).toBe("/assets/lux/07-home-shield.png");
    expect(LUX_ART.shield).toBe("/assets/lux/01-shield-vision.png");
    expect(LUX_ART.automationShield).toBe("/assets/lux/06-automation-shield.png");
    expect(LUX_ART.badge).toBe("/assets/lux/05-logo-badge.png");
    expect(LUX_ART.badgeCode).toBe("/assets/lux/12-badge-code-3045.png");
    expect(LUX_ART.brandType).toBe("/assets/lux/04-brand-type-logo-tr.png");
  });

  test("art pack files exist on disk", async () => {
    for (const rel of Object.values(LUX_ART)) {
      const ok = await Bun.file(`public${rel}`).exists();
      expect(ok).toBe(true);
    }
  });

  test("placement doc locks branded/ as the only source", async () => {
    const doc = await Bun.file("docs/LUX_ART_PLACEMENT.md").text();
    expect(doc).toContain("design-refs-lux/branded/");
    expect(doc).toContain("Never use");
    expect(doc).toContain("digits `3045`");
    expect(doc).toContain("19-fire-property");
    expect(doc).toContain("20-travel");
    expect(doc).toContain("21-installments");
  });
});

describe("login cube glyphs", () => {
  test("uses four unique insurance-field icons", () => {
    expect([...CUBE_ICON_KINDS]).toEqual(["car", "house", "heart", "people"]);
    expect(new Set(CUBE_ICON_LAYOUT.map((item) => item.kind)).size).toBe(4);
  });
});
