# M7 — باشگاه / جشنواره (Loyalty & Campaign)

تاریخ: ۲۰۲۶-۰۹-۲۴ · وضعیت: اسکلت (skeleton) · نمایندگی ۳۰۴۵

## خلاصه
ماژول باشگاه مشتریان و جشنواره فروش نمایندگان (DEMO stub):
- **موتور امتیاز پورتفوی:** قسط زودتر از `due_date_jalali`، خرید بیمه‌نامه جدید، معرفی سرنخ (referral) — نرخ DEMO قابل تنظیم
- **کوپن متقاطع stub:** ۲۰٪ تخفیف آتش‌سوزی (`fire`) پس از خرید `universal_life` / `omid_retirement` (فقط enum قفل Import)
- **داشبورد جشنواره نمایندگان:** امتیاز فصلی per `agentCode` / agency + لیدربورد KPI تخت

## Import / Eng-only (اجباری)

**Loyalty در این بچ اکسل نیست** → Eng-module-only تا اکسل برسد.

منابع (cite):
- `/workspace/shared/ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md`
- `/workspace/shared/MODULE_FORMULA_IMPORT_LOCKS_20260924.md` (Sanhab / DMS / Loyalty / Branch = Eng-only)
- Brief: `KARAFARIN_CORE_MODULES_BRIEF_20260924.md` ماژول ۷
- Research: `insurance-crm-modules-gemini-20260924.txt` (~3693–3700)

### شکل لینک آینده
`policy_number` · `policyholder_code` · `national_id` · تاریخ جلالی **TEXT** `yyyy/mm/dd` (بدون Gregorian)

**Invent نکردن** مقادیر `insurance_type` خارج از enum قفل‌شدهٔ Import.
Trigger کوپن DEMO فقط: `universal_life`, `omid_retirement` → هدف `fire` (یا `fire_family` در schema).

Excel **HOLD** تا `WIPE_GO` · بدون wipe.

## نرخ DEMO (قابل تنظیم در `DEMO_RATES`)
| کلید | مقدار |
|------|------:|
| `early_pay_per_day` | ۱۰ |
| `early_pay_flat` | ۲۵ (کف) |
| `new_policy` | ۱۰۰ |
| `referral` | ۵۰ |

امتیاز زودپرداخت = `max(flat, days_early × per_day)` با ordinal stub جلالی.

## API
| Method | Path |
|--------|------|
| GET | `/api/loyalty/meta` |
| GET | `/api/loyalty/balance?policyholderCode=` |
| POST | `/api/loyalty/earn` `{reason:early_pay\|new_policy\|referral, ...}` |
| GET | `/api/loyalty/ledger?policyholderCode=` |
| POST | `/api/loyalty/coupons/issue` `{triggerPolicyType, policyholderCode}` |
| GET | `/api/loyalty/coupons?policyholderCode=` |
| GET | `/api/loyalty/festival` (campaign meta + leaderboard) |
| POST | `/api/loyalty/festival/score` `{agentCode, points, season?}` |

Store در حافظه + SQL اختیاری. بدون wipe به customers/policies/installments/M1–M6.

## دیتابیس
`vps/migrations/008_loyalty_m7.sql` — جداول:
`loyalty_point_ledger`, `loyalty_coupons`, `loyalty_campaigns`, `loyalty_agent_scores`
(ایدمپوتنت؛ Jalali TEXT؛ بدون دست‌زدن به CRM)

## فرانت
- مسیر: `/loyalty`
- منو: **سایر ← باشگاه** (secondary، `tools.view`)
- RTL داخل AppShell · KPI تخت CSS · بدون Three.js
- بنر DEMO · شِل/تم: HOLD
- **فروشگاه کارآفرین:** deep-link فقط → `https://shop.karafarin-insurance.ir/` («باز کردن فروشگاه»، `target=_blank` یا همین تب). iframe خیر (`X-Frame-Options: SAMEORIGIN`). **بدون** scrape/پروکسی سرور (WAF Attack ID 20000051). بدون ورود CRM.


## VERIFY
```bash
cd vps && python3 -m unittest test_loyalty -v
bun test src/lib/loyalty.test.ts

# optional live API (if app listening):
curl -sS http://127.0.0.1:8088/api/loyalty/meta | head
curl -sS 'http://127.0.0.1:8088/api/loyalty/balance?policyholderCode=100200'
curl -sS -X POST http://127.0.0.1:8088/api/loyalty/earn \
  -H 'Content-Type: application/json' \
  -d '{"reason":"early_pay","policyholderCode":"PH1","paidDateJalali":"1404/06/01","dueDateJalali":"1404/06/10"}'
curl -sS -X POST http://127.0.0.1:8088/api/loyalty/coupons/issue \
  -H 'Content-Type: application/json' \
  -d '{"triggerPolicyType":"universal_life","policyholderCode":"PH1"}'
curl -sS http://127.0.0.1:8088/api/loyalty/festival
curl -sS -X POST http://127.0.0.1:8088/api/loyalty/festival/score \
  -H 'Content-Type: application/json' \
  -d '{"agentCode":"A-110","points":25}'
```

## فایل‌ها
- `vps/loyalty.py` · wire در `vps/app.py` (additive)
- `vps/migrations/008_loyalty_m7.sql`
- `vps/test_loyalty.py`
- `src/lib/loyalty.ts` · `src/lib/loyalty.test.ts`
- `src/routes/loyalty.tsx` · لینک در `src/components/app-shell.tsx`
- Drop-in: `/workspace/shared/fasihi-loyalty-m7.py` + `LOYALTY_M7_MERGE.md`

## محدودیت‌ها
Excel HOLD · UI shell/theme HOLD · بدون secret · بدون wipe · Web tar HOLD
M1–M6 حفظ — شاخه از `feat/dms-m6` (88e093d).
