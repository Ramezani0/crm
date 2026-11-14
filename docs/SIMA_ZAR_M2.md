# M2 — اندوخته طلا سیما زر

تاریخ: ۲۰۲۶-۰۹-۲۴ · وضعیت: اسکلت (skeleton) · نمایندگی ۳۰۴۵

## خلاصه
محصول اندوخته طلا بر پایه گواهی شمش بورس کالا (نماد پیش‌فرض `GOB1CD0001`).
نرخ روزانه پیش‌فرض **زنده از tgju** (طلای ۲۴ عیار آنی، ریال/گرم) است.
روی خطا: نرخ دستی/env حفظ + پیام واضح — DEMO_STUB دیگر مسیر اصلی خاموش نیست.
کارمزد: **۱٪ صدور (ورود)** · **۲٪ ابطال (خروج)** روی ارزش دارایی.
واحد: گرم و میلی‌گرم (۱ g = ۱۰۰۰ mg).
**وام همیشه مسدود** (`loanBlocked: true`) — بنر UI و رد API.

## نرخ زنده (tgju)
- منبع قفل: **tgju · طلای ۲۴ عیار آنی** (ریال/گرم)
- endpoint عمومی: `SIMA_ZAR_RATE_URL` (پیش‌فرض `https://call1.tgju.org/ajax.json`) → `current.geram24.p`
- env: `SIMA_ZAR_RATE_SOURCE` (=`tgju`|`manual`|`demo`) · `SIMA_ZAR_RATE_URL` · `SIMA_ZAR_RATE_KEY` · `SIMA_ZAR_SYMBOL` · اختیاری `SIMA_ZAR_RATE_RIAL_PER_GRAM`
- یا `PUT /api/sima-zar/rate` با `{rialPerGram, symbol?}` برای دستی
- پاسخ: `{ rateRialPerGram, source, updatedAt, configured, live, error? }`

این نرخ‌ها حقوقی/اکچوئری رسمی بیمه نیستند — مرجع نمایشی بازار.

## کارمزد
| عملیات | درصد | اعمال روی |
|--------|------|-----------|
| واریز / صدور دارایی | ۱٪ | ارزش دارایی (= گرم × نرخ) — مبلغ پرداختی = ارزش + کارمزد |
| بازخرید / ابطال | ۲٪ | ارزش دارایی — خالص پرداختی = ارزش − کارمزد |

## API
| Method | Path |
|--------|------|
| GET | `/api/sima-zar/meta` |
| GET/PUT | `/api/sima-zar/rate` |
| GET | `/api/sima-zar/positions?customerId=` |
| POST | `/api/sima-zar/deposit` body `{customerId?, grams\|milligrams, useRate?}` |
| POST | `/api/sima-zar/redeem` body `{positionId, milligrams\|grams}` |
| GET/POST | `/api/sima-zar/preview` fees (`grams`/`milligrams`/`side`) |
| POST | `/api/sima-zar/loan-check` → همیشه `403` + «وام روی این طرح مجاز نیست» |

Store در حافظه با seed؛ SQL اختیاری. بدون تماس wipe به customers/policies/installments.

## دیتابیس
`vps/migrations/003_sima_zar_m2.sql` — جداول `sima_zar_rates`, `sima_zar_positions`, `sima_zar_ledger`
(انواع ledger: `deposit`, `fee_entry`, `withdraw`, `fee_exit`). ایدمپوتنت، بدون wipe.
قید: `loan_blocked IS TRUE`.

## فرانت
- مسیر: `/sima-zar`
- منو: **سایر ← سیما زر** (secondary، `tools.view`)
- RTL داخل AppShell · KPI تخت CSS · بدون Three.js
- بنر قرمز: «وام روی این طرح مجاز نیست»
- شِل/تم: HOLD

## VERIFY
```bash
curl -sS http://127.0.0.1:8088/api/sima-zar/rate | head
curl -sS 'http://127.0.0.1:8088/api/sima-zar/preview?grams=1&side=entry' | head
curl -sS -X POST http://127.0.0.1:8088/api/sima-zar/deposit \
  -H 'Content-Type: application/json' \
  -d '{"customerId":1,"grams":1}'
curl -sS -X POST http://127.0.0.1:8088/api/sima-zar/loan-check \
  -H 'Content-Type: application/json' \
  -d '{"positionId":1}'
```

## فایل‌ها
- `vps/sima_zar.py` · wire در `vps/app.py`
- `vps/test_sima_zar.py`
- `src/lib/sima-zar.ts` · `src/lib/sima-zar.test.ts`
- `src/routes/sima-zar.tsx` · لینک در `src/components/app-shell.tsx`
- Drop-in: `/workspace/shared/fasihi-sima-zar-m2.py` + `SIMA_ZAR_M2_MERGE.md`

## محدودیت‌ها
Excel HOLD · UI shell/theme HOLD · بدون secret · بدون wipe · Web tar HOLD
M1 (`feat/sales-network-m1`) حفظ شده — این شاخه روی آن ساخته شده است.
