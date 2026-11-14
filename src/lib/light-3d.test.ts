import { describe, expect, test } from "bun:test";
import { FIELD_CARD_ACCENTS, FIELD_CARD_KINDS, LIGHT_3D_SURFACES, LINE_CARD_EXTRAS } from "./light-3d";

describe("3D surface lock", () => {
  test("allows exactly five light surfaces and never names list tables", () => {
    expect([...LIGHT_3D_SURFACES]).toEqual([
      "login-hero",
      "dashboard-kpi",
      "pipeline-funnel",
      "dossier-profile",
      "insurance-field-cards",
    ]);
    const blob = LIGHT_3D_SURFACES.join(" ");
    expect(blob).not.toContain("customers-table");
    expect(blob).not.toContain("installments-table");
    expect(blob).not.toContain("policies-table");
  });

  test("field-card accents are unique shapes (not identical clones)", () => {
    const shapes = FIELD_CARD_KINDS.map((kind) => FIELD_CARD_ACCENTS[kind].shape);
    expect(new Set(shapes).size).toBe(FIELD_CARD_KINDS.length);
  });

  test("field cards map onto lux stills from the placement guide", () => {
    expect(FIELD_CARD_ACCENTS["شخص ثالث"].art).toBe("auto");
    expect(FIELD_CARD_ACCENTS["بدنه"].art).toBe("auto");
    expect(FIELD_CARD_ACCENTS["عمر و سرمایه‌گذاری"].art).toBe("life");
    expect(FIELD_CARD_ACCENTS["درمان تکمیلی"].art).toBe("life");
    expect(FIELD_CARD_ACCENTS["آتش‌سوزی"].art).toBe("fire");
    expect(FIELD_CARD_ACCENTS["مسئولیت"].art).toBe("family");
  });

  test("extra line cards wire home / travel / installments stills", () => {
    expect(LINE_CARD_EXTRAS.map((item) => item.art)).toEqual(["home", "travel", "installments"]);
  });
});

describe("tables stay 2D", () => {
  test("customer / policy / installment routes do not import Three.js", async () => {
    const files = [
      "src/routes/customers.tsx",
      "src/routes/policies.tsx",
      "src/routes/installments.tsx",
      "src/components/ui/table.tsx",
      "src/routes/index.tsx",
      "src/routes/pipeline.tsx",
      "src/routes/dashboard.tsx",
      "src/routes/renewals.tsx",
      "src/routes/tasks.tsx",
      "src/components/light-3d/field-icon-cards.tsx",
    ];
    for (const file of files) {
      const text = await Bun.file(file).text();
      expect(text).not.toContain("@react-three");
      expect(text).not.toMatch(/from ["']three["']/);
    }
  });
});
