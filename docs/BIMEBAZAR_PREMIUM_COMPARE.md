# BimeBazar premium compare

Live partners wire for `/premium-calc` (BimeBazar **category hub**: `third_party` + `car_body` live; `other_discover` stub). Alias `/bimebazar` → `/premium-calc`.

Source chip (locked): «از طریق پنل شرکای بیمه‌بازار» — never official Sanhab / never fake public BimeBazar API.

Offers table columns: شرکت · تعرفه · پایه · تخفیف · توانگری (all rows, no truncate).

## Endpoints (VPS `app.py`)
- `GET /api/premium-compare/status` — `{ configured, portalUrl, loginBase, apiBase }` (no secrets)
- `POST /api/premium-compare/quote` — body: `{ line, nationalId, financialCover, year, usage, vehicleType, plate }`
  Returns **all** offers (never truncate). Persian errors for Sanhab fail / empty. `503` if env missing.

## Env (names only)
`BIMEBAZAR_URL`, `BIMEBAZAR_USER`, `BIMEBAZAR_PASS`
Optional: `BIMEBAZAR_LOGIN_BASE` (default `https://shoraka.net`), `BIMEBAZAR_API_BASE` (default `https://iframe.shoraka.net`)
Browser: `VITE_PREMIUM_COMPARE_SOURCE=mock|live`

Secrets live in `/home/box/.secrets/bimebazar.env` — never commit.

## Plate map (UI → API)
Assumption from partners session probe (documented in `vps/bimebazar_client.py`):
- `platePart1` → `plk1`
- `plateLetter` → `plk2` (0-based index in `PLATE_LETTERS`; ب → `"1"`)
- `platePart2` → `plk3`
- `plateIranCode` → `plkSrl`

## QA
```bash
cd vps && python3 test_bimebazar_client.py
bun test src/lib/premium-compare-mock.test.ts src/lib/premium-compare-api.test.ts
```
Prefer mocked HTTP. Optional live dry-run must redact secrets.

## Kept as-is
- `/api/premium-ai/*` and `/api/calc/premium-adjustment`
- AI model via env `PREMIUM_AI_MODEL` (live may use `gemini-3.8-flash`)
