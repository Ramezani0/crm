# Lux art placement (Amir / CoS 2026-09-11) — BRANDED LOCK

**Source lock:** Engineering `/workspace/design-refs-lux/branded/` only (22 stamped PNGs).
**Never use** raw `/workspace/design-refs-lux/*.png`.
**Wired target:** `public/assets/lux/` with the same filenames.

**Badge on every branded still (and login/dashboard lockup):** small Karafarin logo + digits `3045` only.
Not the text «کد ۳۰۴۵», and no dark panel behind the badge.
Live UI titles stay CSS (`title-extrude` / Vazirmatn) — stills are ornaments, not live text.
Copy-card scenes (12 / 15) may show «کد ۳۰۴۵» as the *subject* of the still; the corner badge is still logo + `3045`.

**Tables / lists:** no hero art, no Three.js.

## LOGIN
- Top-right: `05-logo-badge.png` + live digits `3045` (alt: `00-logo-source-karafarin.png`) — no «کد ۳۰۴۵», no panel
- Scene: 3D stretch-lux + animation — `03-cube-umbrella.png` (primary) or `00-hero-cube-source.png`
- `prefers-reduced-motion` / missing WebGL → `EmblemFallback` (SVG / still)
- Copy / type: `04-brand-type-logo-tr.png`, `12-badge-code-3045.png`, `13-lux3d-ramezani.png`, `14-lux3d-fasihi.png`, `15-lux3d-code3045.png`

## DASHBOARD
- Hero ornament: `08-dashboard-automation.png`
- KPI beside: `01-shield-vision.png` and `06-automation-shield.png`
- Compact OfficialMark (`Emblem compact`) — one canvas, not a table

## Line cards (رشته)
- Base banner: `09-line-cards.png`
- Auto: `16-auto-insurance.png` (شخص ثالث / بدنه)
- Life/health: `17-life-health.png` (عمر / درمان)
- Family: `18-family-umbrella.png` (مسئولیت)
- Fire: `19-fire-property.png` (آتش‌سوزی)
- Home: `07-home-shield.png` (منزل و اموال)
- Travel: `20-travel.png` (مسافرت)
- Installments: `21-installments.png` (اقساط — field-card ornament, not the installments table)

## Dossier header (پرونده ۳۶۵)
- `05-logo-badge.png` (alt: `01-shield-vision.png`)

## Pipeline
- Light ornament from `08-dashboard-automation.png` only — CSS funnel, no Three.js on lists.

## Other module pages
- Renewals / tasks: light `08` ornament behind the section, never inside the table/list.
- Municipality: not present in this app.

## Inventory in `public/assets/lux` (branded/ filenames)
00-hero-cube-source, 00-logo-source-karafarin, 01-shield-vision, 02-type-karafarin-3d, 03-cube-umbrella, 04-brand-type-logo-tr, 05-logo-badge, 06-automation-shield, 07-home-shield, 08-dashboard-automation, 09-line-cards, 10-badge-ramezani, 11-badge-fasihi, 12-badge-code-3045, 13-lux3d-ramezani, 14-lux3d-fasihi, 15-lux3d-code3045, 16-auto-insurance, 17-life-health, 18-family-umbrella, 19-fire-property, 20-travel, 21-installments
