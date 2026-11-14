# Locked formulas (live API) — no DB wipe

Constants and schedule math for CRM calc endpoints. Source of truth: `vps/app.py` + `src/lib/premium-adjustment.ts`.

## دیه ۱۴۰۵ — VERIFIED قوه قضاییه

| Field | Value |
|-------|-------|
| `ordinaryRial` | `21_000_000_000` |
| `haramRial` | `28_000_000_000` |
| `ordinaryToman` | `2_100_000_000` |
| `haramToman` | `2_800_000_000` |
| `thirdPartyPropertyMinRial` | `700_000_000` (≈ 2.5% × haram) |
| `thirdPartyPropertyMinToman` | `70_000_000` |
| `year` | `1405` |
| `status` | `VERIFIED` |
| `sourceLabel` | `قوه قضاییه` |

### Endpoints

- `GET` / `POST` `/api/calc/diya`
- Alias: `GET` / `POST` `/api/diya`

Response is the `DIYA_1405_VERIFIED` object (JSON).

```bash
curl -sS https://YOUR_HOST/api/calc/diya | jq .
curl -sS -X POST https://YOUR_HOST/api/diya -H 'Content-Type: application/json' -d '{}' | jq .
```

## تعدیل حق‌بیمه (premium adjustment)

Formula (Rial):

\[
P_n = P_0 \times (1+r)^{n-1}
\]

- `n` = policy year index `1..years` (compat field `year`)
- Each year is a **12-month Jalali insurance year**
- `jalaliYear = startYear + n - 1` (default `startYear = 1405`)
- Toman = Rial / 10 (rounded)

### Endpoints

- `POST` `/api/calc/premium-adjustment`
- Alias: `POST` `/api/premium-adjustment`

Body JSON:

```json
{ "p0": 10000000, "r": 0.1, "years": 3, "startYear": 1405 }
```

`startYear` optional (default 1405). Always returns JSON (never HTML), even on 400.

Success: array of `{ year, jalaliYear, premiumRial, premiumToman }`.

```bash
curl -sS -X POST https://YOUR_HOST/api/calc/premium-adjustment \
  -H 'Content-Type: application/json' \
  -d '{"p0":10000000,"r":0.1,"years":3}' | jq .
# → year 1 → jalaliYear 1405, year 2 → 1406, year 3 → 1407
```

Example: `P0=10_000_000`, `r=0.10`, `n=5` → `14_641_000` Rial.

## SMS test-connection alias

- `POST` `/api/sms-panel/test-connection` (canonical)
- Alias: `POST` `/api/sms/test-connection`
- Live send: `SMS_DRY_RUN=0` (default). Set `SMS_DRY_RUN=1` only for dry-run tests.

```bash
curl -sS -X POST https://YOUR_HOST/api/sms/test-connection \
  -H 'Content-Type: application/json' -d '{}' | jq .
```
