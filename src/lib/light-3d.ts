/** Locked 3D surfaces. Tables (customers / policies / installments grids) stay 2D. */
export const LIGHT_3D_SURFACES = [
  "login-hero",
  "dashboard-kpi",
  "pipeline-funnel",
  "dossier-profile",
  "insurance-field-cards",
] as const;

export type Light3dSurface = (typeof LIGHT_3D_SURFACES)[number];

export const FIELD_CARD_KINDS = [
  "شخص ثالث",
  "بدنه",
  "عمر و سرمایه‌گذاری",
  "درمان تکمیلی",
  "آتش‌سوزی",
  "مسئولیت",
] as const;

export type FieldCardKind = (typeof FIELD_CARD_KINDS)[number];

export type FieldCardArt = "auto" | "life" | "home" | "family" | "fire" | "travel" | "installments";

export const FIELD_CARD_ACCENTS = {
  "شخص ثالث": { shape: "diamond", tone: "emerald", art: "auto" },
  "بدنه": { shape: "hex", tone: "gold", art: "auto" },
  "عمر و سرمایه‌گذاری": { shape: "shield", tone: "emerald", art: "life" },
  "درمان تکمیلی": { shape: "cross", tone: "gold", art: "life" },
  "آتش‌سوزی": { shape: "ember", tone: "warn", art: "fire" },
  "مسئولیت": { shape: "octagon", tone: "emerald", art: "family" },
} as const satisfies Record<
  FieldCardKind,
  { shape: string; tone: "emerald" | "gold" | "warn"; art: FieldCardArt }
>;

/** Extra line stills on the field-card surface (07 / 20 / 21) — not table heroes. */
export const LINE_CARD_EXTRAS = [
  { kind: "منزل و اموال", art: "home", shape: "house", tone: "emerald", unit: "بیمه‌نامه" },
  { kind: "مسافرت", art: "travel", shape: "suitcase", tone: "gold", unit: "بیمه‌نامه" },
  { kind: "اقساط", art: "installments", shape: "calendar", tone: "gold", unit: "قسط" },
] as const satisfies ReadonlyArray<{
  kind: string;
  art: FieldCardArt;
  shape: string;
  tone: "emerald" | "gold" | "warn";
  unit: string;
}>;
