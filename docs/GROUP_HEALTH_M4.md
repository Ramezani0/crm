# M4 — درمان گروهی و معرفی‌نامه (Group Health)

تاریخ: ۲۰۲۶-۰۹-۲۴ · وضعیت: اسکلت (skeleton) · نمایندگی ۳۰۴۵

## خلاصه
ماژول درمان تکمیلی گروهی کارآفرین:
- **E-Referral:** صدور معرفی‌نامه بیمارستانی / پاراکلینیک با استعلام فرانشیز و سقف مانده تعهد
- **کارتابل خسارت سرپایی/دندان:** تطبیق تعرفه stub (کالیفرنیا/ارزش نسبی) + کسر فرانشیز + پیش‌نمایش دستور پرداخت
- **دوره انتظار:** زایمان / جراحی (قابل تنظیم stub)
- **الحاقیه لیست پرسنل:** CSV/JSON stub — **بدون wipe** مشتریان CRM

فرمول DEMO خسارت:
```
ClaimPayout = min((ApprovedTariff − BasicInsurerShare) × (1 − DeductibleRate), RemainingSublimit)
```

## Import / Eng-extension (اجباری)

**هیچ فایل درمان گروهی در n1–n21 نیست** → ماژول Eng-only تا اکسل برسد.

منابع:
- `/workspace/shared/ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md`
- `/workspace/shared/MODULE_FORMULA_IMPORT_LOCKS_20260924.md`
- Brief: `KARAFARIN_CORE_MODULES_BRIEF_20260924.md` ماژول ۴
- Research: `insurance-crm-modules-gemini-20260924.txt` (~3666–3673, 4720–4731)

### `product_code` نه `insurance_type`
Enum قفل‌شدهٔ Import (§2 handoff) شامل `group_health` **نیست**.
این ماژول از **`product_code = group_health`** روی جداول اختصاصی استفاده می‌کند و `policies.insurance_type` را آلوده نمی‌کند تا Import map به‌روز شود.
`insurance_type` روی قراردادهای ماژول **nullable** است (Eng-extension pending Import).

### شکل ورود آینده (وقتی اکسل بیاید)
`policy_number` · `national_id` · `policyholder_code` · `case_365` / `پرونده_365` · تاریخ جلالی **TEXT** `yyyy/mm/dd` (بدون Gregorian)

Excel **HOLD** تا `WIPE_GO` · بدون wipe.

## API
| Method | Path |
|--------|------|
| GET | `/api/group-health/meta` |
| GET | `/api/group-health/contracts` |
| GET | `/api/group-health/members?contractId=` |
| GET | `/api/group-health/ceiling?memberId=&category=` |
| POST | `/api/group-health/referral` `{memberId, type:hospital\|paraclinic, serviceCode?}` |
| GET | `/api/group-health/referrals` |
| POST | `/api/group-health/claims` `{memberId, kind:outpatient\|dental, amount, serviceCode}` |
| GET | `/api/group-health/claims` |
| GET | `/api/group-health/tariff?code=` |
| POST | `/api/group-health/personnel/amendment` `{contractId, adds:[], removes:[], asOfJalali, csv?}` |
| GET | `/api/group-health/waiting?memberId=&benefit=` |

Store در حافظه + SQL اختیاری. بدون تماس wipe به customers/policies/installments/M1–M3.

## دیتابیس
`vps/migrations/005_group_health_m4.sql` — جداول:
`gh_contracts`, `gh_members`, `gh_benefit_ceilings`, `gh_referrals`, `gh_claims`,
`gh_tariff_stub`, `gh_personnel_amendments`, `gh_waiting_rules`
(ایدمپوتنت؛ `product_code=group_health`؛ Jalali TEXT؛ `case_365` JSONB)

## فرانت
- مسیر: `/group-health`
- منو: **سایر ← درمان گروهی** (secondary، `tools.view`)
- RTL داخل AppShell · KPI تخت CSS · بدون Three.js
- شِل/تم: HOLD

## VERIFY
```bash
curl -sS http://127.0.0.1:8088/api/group-health/meta | head
curl -sS http://127.0.0.1:8088/api/group-health/contracts | head
curl -sS 'http://127.0.0.1:8088/api/group-health/ceiling?memberId=1&category=hospital'
curl -sS -X POST http://127.0.0.1:8088/api/group-health/referral \
  -H 'Content-Type: application/json' \
  -d '{"memberId":1,"type":"paraclinic","serviceCode":"GH-P-210"}'
curl -sS http://127.0.0.1:8088/api/group-health/referrals | head
curl -sS -X POST http://127.0.0.1:8088/api/group-health/claims \
  -H 'Content-Type: application/json' \
  -d '{"memberId":1,"kind":"dental","amount":2000000,"serviceCode":"GH-D-310"}'
curl -sS 'http://127.0.0.1:8088/api/group-health/tariff?code=GH-D-310'
curl -sS -X POST http://127.0.0.1:8088/api/group-health/personnel/amendment \
  -H 'Content-Type: application/json' \
  -d '{"contractId":1,"asOfJalali":"1404/07/01","adds":[{"memberCode":"M-X","fullName":"تست"}],"removes":[]}'
curl -sS 'http://127.0.0.1:8088/api/group-health/waiting?memberId=3&benefit=surgery'
```

## فایل‌ها
- `vps/group_health.py` · wire در `vps/app.py`
- `vps/test_group_health.py`
- `src/lib/group-health.ts` · `src/lib/group-health.test.ts`
- `src/routes/group-health.tsx` · لینک در `src/components/app-shell.tsx`
- Drop-in: `/workspace/shared/fasihi-group-health-m4.py` + `GROUP_HEALTH_M4_MERGE.md`

## محدودیت‌ها
Excel HOLD · UI shell/theme HOLD · بدون secret · بدون wipe · Web tar HOLD
M1 (`sales-network`) · M2 (`sima-zar`) · M3 (`omid-pension`) حفظ — این شاخه از `feat/omid-pension-m3` ساخته شده است.
