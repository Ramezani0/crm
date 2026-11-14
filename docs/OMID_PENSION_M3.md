# M3 — امید بازنشستگی (Omid Pension)

تاریخ: ۲۰۲۶-۰۹-۲۴ · وضعیت: اسکلت (skeleton) · نمایندگی ۳۰۴۵

## خلاصه
محصول مستمری امید بازنشستگی کارآفرین:
- فازها: `accumulation` → `guaranteed_10y` (سال ۰–۹) → `lifetime` (سال ۱۰+)
- سن بازنشستگی **۵۰–۶۱**
- تعدیل مرکب **۱۰٪**: `MonthlyPension_yearN = MonthlyPension_0 * (1.10)^N` (**DEMO**)
- فوت در تضمینی → باقی جدول به ذی‌نفع؛ فوت در مادام‌العمر → توقف
- Proof of Life stub (`pending|confirmed|expired`) — SMS/ثبت‌احوال TODO؛ بدون تأیید، پیشروی پرداخت مسدود
- ورود به فاز مستمری → **قفل وام و بازخرید**

## Import / فرمول قفل‌ها (اجباری)
- `/workspace/shared/ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md`
- `/workspace/shared/MODULE_FORMULA_IMPORT_LOCKS_20260924.md`
- Map: `/workspace/shared/IMPORT_MAP_20260924_NEW.md` · فایل `n5.xlsx` · `insurance_type = omid_retirement`

### لینک طرح
`policy_number` + `national_id` (+ اختیاری `policyholder_code` پس از join NID→holder؛ روی n5 holder parse_ok=0)

### life_policy_meta (land as-is از n5)
| Field | Excel |
|-------|-------|
| `first_year_end_reserve` | اندوخته پایان سال اول |
| `premium_escalate_pct` | درصد افزایش سالانه حق بیمه |
| `sum_insured_escalate_pct` | درصد افزایش سالانه سرمایه |

### سایر
- `case_365` / `پرونده_365`: کلیدهای فارسی OK
- تاریخ جلالی: **TEXT** `yyyy/mm/dd` — بدون Gregorian
- Eng owns: جدول ۱۰٪ مرکب، PoL، قفل وام در payout — Import این‌ها را حساب نمی‌کند
- **Overwrite ممنوع** روی حق‌بیمه تاریخی واردشده
- Excel **HOLD** تا `WIPE_GO` · بدون wipe

## API
| Method | Path |
|--------|------|
| GET | `/api/omid-pension/meta` |
| GET/POST | `/api/omid-pension/simulate` `{retirementAge, accumulationYears, accumulationRial?}` |
| GET/POST | `/api/omid-pension/plans` |
| POST | `/api/omid-pension/transition` `{planId}` |
| GET | `/api/omid-pension/schedule/{planId}` |
| POST | `/api/omid-pension/payout/preview` |
| POST | `/api/omid-pension/death` `{planId}` |
| GET/POST | `/api/omid-pension/proof-of-life` |

Store در حافظه + SQL اختیاری. بدون تماس wipe به customers/policies/installments/sima_zar/sales_network.

## دیتابیس
`vps/migrations/004_omid_pension_m3.sql` — جداول:
`omid_pension_plans`, `_beneficiaries`, `_schedules`, `_payouts`, `_pol_checks`
(ایدمپوتنت؛ `insurance_type` قفل `omid_retirement`؛ Jalali TEXT؛ `life_policy_meta` / `case_365` JSONB)

## فرانت
- مسیر: `/omid-pension`
- منو: **سایر ← امید بازنشستگی** (secondary، `tools.view`)
- RTL داخل AppShell · KPI تخت CSS · بدون Three.js
- شِل/تم: HOLD

## VERIFY
```bash
curl -sS http://127.0.0.1:8088/api/omid-pension/meta | head
curl -sS -X POST http://127.0.0.1:8088/api/omid-pension/simulate \
  -H 'Content-Type: application/json' \
  -d '{"retirementAge":55,"accumulationYears":15,"accumulationRial":240000000}'
curl -sS http://127.0.0.1:8088/api/omid-pension/plans | head
curl -sS -X POST http://127.0.0.1:8088/api/omid-pension/plans \
  -H 'Content-Type: application/json' \
  -d '{"retirementAge":55,"accumulationYears":12,"policyNumber":"OM-1","nationalId":"001","life_policy_meta":{"first_year_end_reserve":240000000,"premium_escalate_pct":10,"sum_insured_escalate_pct":10}}'
curl -sS -X POST http://127.0.0.1:8088/api/omid-pension/transition \
  -H 'Content-Type: application/json' -d '{"planId":2}'
curl -sS http://127.0.0.1:8088/api/omid-pension/schedule/2 | head
curl -sS -X POST http://127.0.0.1:8088/api/omid-pension/proof-of-life \
  -H 'Content-Type: application/json' -d '{"planId":2,"status":"confirmed"}'
curl -sS -X POST http://127.0.0.1:8088/api/omid-pension/payout/preview \
  -H 'Content-Type: application/json' -d '{"planId":2,"yearIndex":1}'
curl -sS -X POST http://127.0.0.1:8088/api/omid-pension/death \
  -H 'Content-Type: application/json' -d '{"planId":2}'
```

## فایل‌ها
- `vps/omid_pension.py` · wire در `vps/app.py`
- `vps/test_omid_pension.py`
- `src/lib/omid-pension.ts` · `src/lib/omid-pension.test.ts`
- `src/routes/omid-pension.tsx` · لینک در `src/components/app-shell.tsx`
- Drop-in: `/workspace/shared/fasihi-omid-pension-m3.py` + `OMID_PENSION_M3_MERGE.md`

## محدودیت‌ها
Excel HOLD · UI shell/theme HOLD · بدون secret · بدون wipe · Web tar HOLD
M1 (`sales-network`) و M2 (`sima-zar`) حفظ شده‌اند — این شاخه روی `feat/sima-zar-m2` ساخته شده است.
