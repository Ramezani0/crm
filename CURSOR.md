# Fasihi CRM — Cursor handoff

Product Owner: Amirhossein Ramezani. Persian RTL insurance CRM for Karafarin Agency **3045** (Fatemeh Fasihi).

Live demo (Lovable): https://fasihi-crm.lovable.app
Production domain: https://www.fasihicrm.ir
Lovable project: `b03d0b17-2002-4c2d-a2ca-9ecb7d4b9b9c`
Latest known Lovable commit: `1f166b9f`
Agency brief: [AGENCY.md](./AGENCY.md)

## What this repo is

Partial frontend export from Lovable (~80 files). **Not complete** vs original ~107.
`vps/app.py` = Python API on VPS. `vps/Caddyfile` may be stale vs live `/opt/fasihi/Caddyfile`.

## What is live on VPS (FACT 2026-09-11)

Host: `95.38.182.128` — Ubuntu 24.04, ~1GB RAM — `/opt/fasihi`.

Containers: `fasihi-caddy`, `fasihi-db` (127.0.0.1:5432), `fasihi-api` (:8088), `fasihi-web` (:3000, bun nitro).

Live Caddy routes `/api/*` and `/data*` → api; `/` → `fasihi-web:3000` (self-hosted UI build present).

Postgres: **1352** / **3499** / **3112**. Do not re-import.

### DNS blocker (2026-09-11)

Public DNS for `@` and `www` → `185.10.75.58` (cPanel 404). App is healthy when Host hits `95.38.182.128`. Fix: Cloudflare A `@` + `www` = `95.38.182.128`, proxy **off**.

New VPS `185.204.197.49`: SSH publickey-only; box pubkey must be installed before use.

## Mapping bugs / next work

See AGENCY.md. Priority: DNS → full source → wire store to `/api/data` → mapping fixes → agency branding 3045 → QA.

Rules: `source_system=fasihicrm`, UTF-8-SIG, no wipe, no invented mobile zeros, no secrets in git.
