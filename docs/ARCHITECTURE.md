# Fasihi CRM v2 — Architecture

Phase 1 (48–72h concept): skeletal UI + contracts. **Do not invent a new database.** Live Postgres on the existing VPS stays the source of truth. See [AGENCY.md](../AGENCY.md), [VISION-V2.md](../VISION-V2.md), [CURSOR.md](../CURSOR.md).

## Stack

| Layer | Choice | Notes |
|-------|--------|--------|
| Frontend | React 19 + **TanStack Start** + Tailwind 4 + shadcn/ui | File routes in `src/routes/`. RTL (`html[lang=fa][dir=rtl]`). Vazirmatn. |
| 3D | Three.js + React Three Fiber + Drei | **Only** login (`/`) and dashboard hero. Lazy / dynamic import. |
| Backend | Existing Python API in `vps/app.py` | stdlib HTTP + psycopg. Listens `0.0.0.0:8088`. |
| Database | Postgres 16 on VPS (`fasihi-db`) | **1352** customers / **3499** policies / **3112** installments. No wipe, no TRUNCATE, no reimport. |
| Edge | Caddy on VPS | `/api/*` and `/data*` → API; `/` → app. |

Phase 2 hydrates `StoreProvider` from `GET /api/data` via `getApiData()` / `fetchApiData()`. If the VPS is unreachable or the payload is invalid, the store keeps the Phase 1 **demo seed** (`buildDemoData()`). The helper itself still returns the tiny documented `MOCK_DATA` shape. `/api/health` stays a separate live count probe and must not be overwritten by the client.

## 3D insurance scene

Metaphors (shield / umbrella / growth) appear **only** on:

1. Login page (`src/routes/index.tsx`)
2. Dashboard hero (`src/routes/dashboard.tsx`)

Implementation:

- Mount point: `src/components/emblem/Emblem.tsx`
- Scene chunk: `src/components/emblem/InsuranceScene.tsx` (default export, loaded with `React.lazy`)
- Static SVG: `src/components/emblem/EmblemFallback.tsx`

### Performance rules (non-negotiable)

- **No global Three.js.** Never import `three` / `@react-three/*` from `__root`, `app-shell`, tables, or operational modules.
- **Lazy / dynamic import** the scene after client mount.
- **`prefers-reduced-motion: reduce`** → static SVG only; do not fetch the 3D chunk.
- Probe WebGL (`getContext("webgl2"|"webgl")`) before loading Three; no context → SVG.
- Pause the rAF loop when the tab is hidden (`document.hidden`).
- If WebGL fails at runtime, render the static fallback (error boundary).
- Operational pages (customers, policies, installments, …) stay 2D and snappy.

## Branding (from AGENCY.md)

| Slot | FA string |
|------|-----------|
| Title | CRM فصیحی |
| Subtitle | مدیریت هوشمند بیمه‌نامه، اقساط و مشتریان — نمایندگی ۳۰۴۵ بیمه کارآفرین |
| Footer | نمایندگی بیمه کارآفرین کد ۳۰۴۵ — خانم فاطمه فصیحی \| CRM فصیحی |

Palette: navy / teal / emerald. Tokens live in `src/styles.css` and copy in `src/lib/brand.ts`.

## Auth (Phase 1)

Demo login is **client-side and placeholder**. Usernames `ceo` / `manager` / `sales` / `accounting` exist in demo data.

- Password is read from `VITE_DEMO_PASSWORD` (never committed).
- If that env var is empty, any **non-empty** password is accepted for named demo users.
- **No plaintext secrets in source**, README, or login UI.

## API contracts

Live implementation: `vps/app.py`. CORS: `GET`, `OPTIONS`. `Cache-Control: no-store`. JSON UTF-8.

Base URL for the browser client: `VITE_API_BASE_URL` (empty = same-origin). Frontend helper: `src/lib/api.ts`.

### `GET /api/health`

Liveness + row counts. Used by the dashboard chip and ops checks.

**200**

```json
{
  "ok": true,
  "counts": {
    "customers": 1352,
    "policies": 3499,
    "installments": 3112
  }
}
```

**404 / 500**

```json
{
  "ok": false,
  "error": "not found"
}
```

TypeScript: `HealthResponse` in `src/lib/api.ts`.

Phase 1 mock (when fetch fails) uses the known VPS counts above and sets `source: "mock"` on the client wrapper only — that field is **not** part of the wire contract.

### `GET /api/data`

Mapped CRM snapshot for the UI store. Phase 2 hydrates `StoreProvider` from this payload (demo seed if the request fails). Customer objects include optional `legalEntityId` (شناسه حقوقی) when the API column is present. Known mapping bugs (kind, holder, computer_code) are documented in AGENCY.md / CURSOR.md — **do not “fix” them by wiping or reimporting**.

**200**

```json
{
  "customers": [
    {
      "id": "C-0012345678",
      "fullName": "فاطمه محمدی",
      "nationalId": "0012345678",
      "legalEntityId": "",
      "phone": "09121234567",
      "email": "",
      "city": "",
      "status": "active",
      "segment": "حقیقی",
      "agent": "",
      "createdAt": "2026-09-11T00:00:00+00:00",
      "note": ""
    }
  ],
  "policies": [
    {
      "id": "P-1",
      "number": "7",
      "customerId": "C-0012345678",
      "kind": "عمر و سرمایه‌گذاری",
      "company": "بیمه کارآفرین",
      "premium": 12000000,
      "startDate": "2025-01-01",
      "endDate": "2026-01-01",
      "status": "active",
      "installmentCount": 1
    }
  ],
  "installments": [
    {
      "id": "I-1",
      "policyId": "P-1",
      "customerId": "C-0012345678",
      "seq": 1,
      "amount": 4000000,
      "paidAmount": 0,
      "dueDate": "2026-06-01",
      "status": "overdue",
      "payments": []
    }
  ]
}
```

Field notes (as the live API actually emits):

| Entity | Field | Notes |
|--------|--------|--------|
| Customer `status` | `"active"` \| `"inactive"` \| `"lead"` | Mapped from Persian source status. UI should prefer showing Persian labels. |
| Customer `segment` | `"حقیقی"` \| `"حقوقی"` | Entity type, not the legal entity ID. |
| Customer `legalEntityId` | string | `customers.legal_entity_id` (شناسه حقوقی). Empty when null/absent. Keep as text. |
| Customer `city` | string | Often empty — render `—`. |
| Policy `kind` | string | API currently forces unknown kinds to `عمر و سرمایه‌گذاری` (known bug). |
| Policy `number` | string | Often tiny; prefer `computer_code` later as identifier. |
| Policy `status` | `"active"` \| `"expired"` \| `"pending"` \| `"cancelled"` | |
| Installment `status` | currently `"overdue"` on the live mapper | UI still models `paid` / `due` / `overdue` / `partial`. |
| Installment `payments` | always `[]` today | |

**500**

```json
{ "ok": false, "error": "<exception message>" }
```

TypeScript: `ApiDataResponse` in `src/lib/api.ts`.

### Slim list endpoints

`/api/data` serializes the whole CRM (~20MB) and is far too heavy for a first paint. These read the
same tables through the same mappers and return only the fields a list renders. All of them are
read-only: no schema change, no writes, no reimport.

| Endpoint | Query | Returns |
|----------|-------|---------|
| `GET /api/data/summary` | — | `{ customers[], counts }` — slim customers (no extras / policies / installments). |
| `GET /api/customers` | `limit`, `offset`, `q`, `id` | `{ customers[], total, limit, offset }`. |
| `GET /api/customers/{id}` | — | One پرونده: `{ customer, policies[], installments[], holderCodes[] }`. |
| `GET /api/admin/backfill-holder-code` | — | Dry-run report: fill empty `customers.holder_code` from «کد N» in `full_name`. |
| `POST /api/admin/backfill-holder-code` | `{dryRun?, token?}` | Same; `dryRun` default true. Apply (`dryRun:false`) needs `X-Admin-Token` / `ADMIN_TOKEN`. Never overwrites non-empty. |

| `GET /api/policies/lite` | `limit`, `offset`, `q` | `{ policies[], total, limit, offset }`. |
| `GET /api/installments` | `status`, `limit`, `offset`, `q` | `{ installments[], total, limit, offset, statuses[], asOf }`. |
| `GET /api/renewals` | `withinDays`, `limit`, `offset`, `q` | `{ policies[], total, limit, offset, withinDays, asOf }`. |

`limit` is capped at 200 on every slim endpoint.

#### `GET /api/installments?status=overdue,due&limit=200`

اقساط page feed. `status` accepts a comma list of `paid` / `due` / `overdue` / `partial`, plus
`unpaid` (= due + overdue + partial) and `all`; the default is `overdue,due`. Status is derived
server-side from amounts first, then سررسید — the same rule as `deriveInstallmentStatus()` on the
client. Rows are sorted by due date (undated last).

```json
{
  "installments": [
    {
      "id": "I-1",
      "policyId": "P-1",
      "policyNumber": "1404/100201",
      "computerCode": "77",
      "customerId": "C-0011748206",
      "customerName": "فاطمه محمدی",
      "seq": 1,
      "amount": 1000000.0,
      "paidAmount": 0.0,
      "dueDate": "1404/01/01",
      "daysLeft": -102,
      "status": "overdue",
      "statusLabel": "معوق",
      "holderCode": "88012",
      "holder_code": "88012"
    }
  ],
  "total": 2,
  "limit": 200,
  "offset": 0,
  "statuses": ["due", "overdue"],
  "asOf": "2025-07-01"
}
```

#### `GET /api/renewals?withinDays=45&limit=200`

تمدید page feed: **active** policies whose `endDate` falls in the `0..withinDays` window
(`withinDays` defaults to 45, capped at 365). `dueDate` / `endDate` stay exactly as stored — most
live rows are Jalali text (`1404/04/19`), so the API converts Jalali → Gregorian before the day math
(`jalali_to_gregorian` in `vps/app.py` mirrors `jalaliToGregorian` in `src/lib/format.ts`). Gregorian
ISO rows still work. Rows are sorted by `endDate`.

```json
{
  "policies": [
    {
      "id": "P-1",
      "number": "1404/100201",
      "policyNumber": "1404/100201",
      "customerId": "C-0011748206",
      "customerName": "فاطمه محمدی",
      "kind": "درمان",
      "endDate": "1404/04/19",
      "daysLeft": 9,
      "status": "active",
      "statusLabel": "عادي",
      "holderCode": "88012",
      "holder_code": "88012"
    }
  ],
  "total": 1,
  "limit": 200,
  "offset": 0,
  "withinDays": 45,
  "asOf": "2025-07-01"
}
```

TypeScript: `ApiInstallmentsDue` / `ApiRenewalsResponse` in `src/lib/api.ts`. `/installments` and
`/renewals` call these whenever the `/api/data` store rows are still empty (`shouldUseSlimFeed()` in
`src/lib/due-lists.ts`); the demo seed still wins when the API is unreachable.

### Related (not Phase 1 UI)

- `GET /data` — HTML dump of the same snapshot (ops / debug).
- `OPTIONS /api/*` — CORS preflight.
- `GET /api/sms` / `GET /api/sms/status` — Iran Payamak status (booleans only; no secrets). Configured when a line (`IRANPAYAMAK_LINE` / `IRANPAYAMAK_LINE_NUMBER` / `LINE_NUMBER`) and either `IRANPAYAMAK_API_KEY` or `IRANPAYAMAK_USERNAME`+`IRANPAYAMAK_PASSWORD` are set.
- `POST /api/sms/send` (alias `POST /api/sms`) — send SMS via Iran Payamak. **Does not touch Postgres.** Returns `نیاز به env / API` when credentials/line are missing.
- `POST /api/sms/notify` — auto-notify `09138917291` on site-change events: `customer_create`, `policy_edit`, `settings_save` (`staff_login` reserved, not fired from demo login).
- `GET|POST /api/sms/inbound` — webhook for inbound SMS. Essential tasks are created **only** from the locked whitelist. Non-whitelist messages are dropped.
- `GET /api/sms/inbox` / `GET /api/sms/tasks?sync=1` — poll Iran Payamak inbox, ingest whitelist tasks.
- `GET /api/sms/tasks` / `PATCH /api/sms/tasks` — list / set status (`انجام‌شد` / `نشد` / `درحال‌انجام`). Stored in `vps/sms-store.json` (not CRM tables).

Inbound whitelist (exact after `09xxxxxxxxx` normalize): `09138917291`, `09180089780`, `09133938543`, `09386674005`, `09213908576`, `09120973209`.

## Frontend module map (Phase 1)

| Route | Module | Data |
|-------|--------|------|
| `/` | Login + 3D emblem | Demo auth |
| `/dashboard` | Shell + 3D hero + KPIs | Live CRM store + `/api/health` chip |
| `/customers` | مشتریان | Live `/api/data` (demo fallback) |
| `/customers/$customerId` | پرونده ۳۶۵ | Full dossier from the hydrated store |
| `/policies` | بیمه‌نامه‌ها | Live `/api/data` (demo fallback) |
| `/installments` | اقساط | `GET /api/installments` first, full `/api/data` when hydrated (demo fallback) |
| `/renewals` | تمدید | `GET /api/renewals?withinDays=45` first, full `/api/data` when hydrated (demo fallback) |
| `/pipeline` | پایپلاین | Mock opportunities stub |
| `/reports` | گزارش‌ها | Live CRM rows when API is up |
| `/users` | کاربران | Roles matrix (demo users) |

Secondary routes kept from the Lovable export: `/tasks`, `/notifications`, `/settings`, `/audit`.

## What Phase 1–2 do **not** do

- No new Postgres schema, no migrations, no TRUNCATE, no CSV reimport.
- No Caddy / DNS / VPS cutover.
- No client writes to Postgres. CRM mutations (`upsertCustomer`, `upsertPolicy`, registerPayment, import, pipeline convert) stay **in-memory only**. SMS endpoints talk to Iran Payamak env only and never write CRM tables.
- 3D lock (exactly five light RTL-safe surfaces): login hero (Three.js cube/umbrella/logo), dashboard KPI orbs, pipeline CSS funnel, dossier profile badge, insurance field cards. **No Three.js on customers/policies/installments tables.**
- No hardcoded passwords or `db.env` material.

## Phase 2 store wiring

- Boot: empty CRM arrays (users / pipeline / tasks still from demo) → `getApiData()`.
- `source: "live"` → `mapApiSnapshot()` into `Customer` / `Policy` / `Installment` (string ids, leading zeros preserved, empty phone/city allowed).
- Display-only kind aliases (e.g. سواری/اتومبیل → شخص ثالث). Known API bugs (forced عمر, `installmentCount: 1` on the wire, missing `computer_code`) are **not** “fixed” by wiping or reimporting.
- Installment `paid` / `due` / `overdue` / `partial` is derived on the client from amounts + due date; the live mapper still emits `"overdue"`.
- `source: "mock"` or fetch error → `buildDemoData()` CRM rows. UI must not crash.
- `/api/health` remains an independent count probe (~1352 / 3499 / 3112 when the VPS is up).

## Later

1. Write API (if added) must preserve `source_system=fasihicrm` — not in this phase.
2. Keep 3D scoped; never add Three.js to tables.
3. QA counts on the production host **without** reimport.
