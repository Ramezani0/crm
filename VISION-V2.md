# Fasihi CRM v2 — Vision (from zero UI, keep data)

Ordered 2026-09-11 by Amir for Karafarin Agency **3045** — Fatemeh Fasihi.

## Goal
A stunning Persian RTL insurance CRM: 3D frontend with beautiful insurance-themed animations, easy but complete modules, strong backend + strong database.

## Non-negotiables
- **Keep** Postgres data on `95.38.182.128` (1352 / 3499 / 3112). No wipe. No reimport unless PO asks.
- `source_system = fasihicrm`
- RTL must stay fast. **3D only** on login + dashboard hero (dynamic import, static fallback, `prefers-reduced-motion`).
- Priority: data → stability → correctness → performance → UX → appearance.

## Stack (recommended)
| Layer | Choice |
|-------|--------|
| Frontend | TanStack Start / React + Tailwind + shadcn-style UI |
| 3D | Three.js / R3F — scoped scenes (shield, umbrella, growth) |
| Backend | Existing Python API → evolve to clear REST/JSON contract |
| DB | Postgres 16 (already live) |
| Edge | Caddy on VPS |

## Modules (complete but simple UX)
1. Dashboard (renewals, overdue, KPIs) + 3D hero
2. Policyholders
3. Policies
4. Installments / debt
5. Pipeline (فروش)
6. Reports
7. Users / roles (ceo, manager, sales, accounting)

## Branding
- Title: CRM فصیحی
- Subtitle: مدیریت هوشمند بیمه‌نامه، اقساط و مشتریان — نمایندگی ۳۰۴۵ بیمه کارآفرین
- Footer: نمایندگی بیمه کارآفرین کد ۳۰۴۵ — خانم فاطمه فصیحی | CRM فصیحی
- Palette: navy / teal / emerald

## Phases
1. Architecture + 3D login/hero shell + nav
2. Wire modules to `/api/*` (real data)
3. Mapping fixes + QA
4. DNS → production domain; optional migrate to 185.204 later

See also: AGENCY.md, CURSOR.md
