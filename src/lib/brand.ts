/** Canonical Agency 3045 copy. Keep in sync with AGENCY.md and DESIGN_EMERALD_GOLD.md. */

export const BRAND = {
  title: "CRM فصیحی",
  titleEn: "Fasihi CRM",
  subtitle: "مدیریت هوشمند بیمه‌نامه، اقساط و مشتریان — نمایندگی ۳۰۴۵ بیمه کارآفرین",
  subtitleShort: "نمایندگی ۳۰۴۵ بیمه کارآفرین",
  agencyLine: "بیمه کارآفرین کد ۳۰۴۵",
  tagline: "اقساط معوق، یادآوری تمدید، گزارش مدیریتی",
  footer: "نمایندگی بیمه کارآفرین کد ۳۰۴۵ — خانم فاطمه فصیحی | CRM فصیحی",
  insurer: "بیمه کارآفرین",
  agencyCode: "3045",
  agencyCodeFa: "۳۰۴۵",
  loginCodeLine: "کد ۳۰۴۵",
  loginAgency: "نمایندگی خانم فاطمه فصیحی",
  loginManager: "امیرحسین رمضانی راد",
  representative: "خانم فاطمه فصیحی",
  representativeShort: "فاطمه فصیحی",
  managers: "امیرحسین رمضانی‌راد و فاطمه فصیحی",
  managementLine: "مدیریت: امیرحسین رمضانی‌راد و فاطمه فصیحی",
  productionUrl: "https://www.fasihicrm.ir",
} as const;

export const LUX_DIR = "/assets/lux";

/** Wired stills from docs/LUX_ART_PLACEMENT.md — files live in public/assets/lux/.
 *  Source lock: Engineering `/workspace/design-refs-lux/branded/` only (never raw design-refs-lux/*.png).
 *  Badge on stills: small Karafarin logo + digits `3045` only — no «کد ۳۰۴۵», no dark panel.
 */
export const LUX_ART = {
  logo: `${LUX_DIR}/00-logo-source-karafarin.png`,
  hero: `${LUX_DIR}/00-hero-cube-source.png`,
  shield: `${LUX_DIR}/01-shield-vision.png`,
  typeKarafarin: `${LUX_DIR}/02-type-karafarin-3d.png`,
  cubeUmbrella: `${LUX_DIR}/03-cube-umbrella.png`,
  brandType: `${LUX_DIR}/04-brand-type-logo-tr.png`,
  badge: `${LUX_DIR}/05-logo-badge.png`,
  automationShield: `${LUX_DIR}/06-automation-shield.png`,
  home: `${LUX_DIR}/07-home-shield.png`,
  dashboard: `${LUX_DIR}/08-dashboard-automation.png`,
  lineCards: `${LUX_DIR}/09-line-cards.png`,
  badgeRamezani: `${LUX_DIR}/10-badge-ramezani.png`,
  badgeFasihi: `${LUX_DIR}/11-badge-fasihi.png`,
  badgeCode: `${LUX_DIR}/12-badge-code-3045.png`,
  ramezani: `${LUX_DIR}/13-lux3d-ramezani.png`,
  fasihi: `${LUX_DIR}/14-lux3d-fasihi.png`,
  code3045: `${LUX_DIR}/15-lux3d-code3045.png`,
  auto: `${LUX_DIR}/16-auto-insurance.png`,
  life: `${LUX_DIR}/17-life-health.png`,
  family: `${LUX_DIR}/18-family-umbrella.png`,
  fire: `${LUX_DIR}/19-fire-property.png`,
  travel: `${LUX_DIR}/20-travel.png`,
  installments: `${LUX_DIR}/21-installments.png`,
} as const;

export type LuxArtKey = keyof typeof LUX_ART;

export const BRAND_ASSETS = {
  logo: "/brand/karafarin-logo.png",
  logoSm: "/brand/karafarin-256.png",
  favicon: "/favicon-karafarin.svg",
  lux: LUX_ART,
} as const;

export const DEMO_USERNAMES = ["ceo", "manager", "sales", "accounting"] as const;
