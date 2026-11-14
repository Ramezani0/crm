# M5 — سنهاب / بیمه مرکزی (Sanhab Connector)

تاریخ: ۲۰۲۶-۰۹-۲۴ · وضعیت: اسکلت (skeleton) · نمایندگی ۳۰۴۵

## خلاصه
ماژول انطباق و استعلامات نظارتی بیمه مرکزی (DEMO stub — **بدون تماس شبکه واقعی**):
- **تجمیع سرمایه فوت:** استعلام جمع سرمایه فوت شخص در صنعت در برابر سقف قابل‌تنظیم؛ پرچم over-limit؛ ورود دستی override مجاز (DEMO)
- **پلاک / VIN:** تخفیف عدم‌خسارت ثالث و بدنه، تعداد سابقه تصادف؛ تخصیص و چاپ **کد یکتا** (`SNH-YYYYMMDD-XXXXXXXX`) روی رکورد خودرو با لینک `policy_number` / `computer_code`
- **صف ارسال دوره‌ای:** صدور / الحاقیه / تراکنش مالی → لیست صف → خروجی JSON+CSV stub → علامت exported

## Import / Eng-only (اجباری)

**Sanhab unique-code / VIN در این بچ اکسل نیست** → Eng-module-only تا اکسل برسد.

منابع (cite):
- `/workspace/shared/ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md` (§4 Sanhab)
- `/workspace/shared/MODULE_FORMULA_IMPORT_LOCKS_20260924.md` (Sanhab Eng-only)
- Brief: `KARAFARIN_CORE_MODULES_BRIEF_20260924.md` ماژول ۵
- Research: `insurance-crm-modules-gemini-20260924.txt` (~3675–3682, 523–532, 1578)

### شکل ورود آینده
`policy_number` · `computer_code` · `national_id` · فیلدهای پلاک/VIN در `case_365` / `پرونده_365` · تاریخ جلالی **TEXT** `yyyy/mm/dd` (بدون Gregorian)

**Invent نکردن** مقادیر `insurance_type` خارج از enum قفل‌شدهٔ Import.

Excel **HOLD** تا `WIPE_GO` · بدون wipe.

## API
| Method | Path |
|--------|------|
| GET | `/api/sanhab/meta` |
| GET/PUT | `/api/sanhab/death-ceiling` |
| POST | `/api/sanhab/death-inquiry` `{nationalId, proposedCapital?}` |
| POST | `/api/sanhab/vehicle-inquiry` `{plate?, vin?, policyNumber?}` |
| POST | `/api/sanhab/unique-code` `{policyNumber, computerCode?}` |
| GET | `/api/sanhab/unique-code?policyNumber=` |
| POST | `/api/sanhab/export-queue` `{kind, payload}` |
| GET | `/api/sanhab/export-queue` |
| POST | `/api/sanhab/export/run` → مسیر فایل batch زیر `.output/sanhab-exports` |

Store در حافظه + SQL اختیاری. بدون wipe به customers/policies/installments/M1–M4. بدون شبکه سنهاب.

## دیتابیس
`vps/migrations/006_sanhab_m5.sql` — جداول:
`sanhab_industry_ceiling_config`, `sanhab_inquiries`, `sanhab_unique_codes`,
`sanhab_export_queue`, `sanhab_export_batches`
(ایدمپوتنت؛ Jalali TEXT؛ `case_365` JSONB؛ بدون دست‌زدن به CRM)

## فرانت
- مسیر: `/sanhab`
- منو: **سایر ← سنهاب** (secondary، `tools.view`)
- RTL داخل AppShell · KPI تخت CSS · بدون Three.js
- بنر DEMO · شِل/تم: HOLD

## VERIFY
```bash
cd vps && python3 -m unittest test_sanhab -v
bun test src/lib/sanhab.test.ts

# optional live API (if app listening):
curl -sS http://127.0.0.1:8088/api/sanhab/meta | head
curl -sS http://127.0.0.1:8088/api/sanhab/death-ceiling
curl -sS -X PUT http://127.0.0.1:8088/api/sanhab/death-ceiling \
  -H 'Content-Type: application/json' -d '{"ceilingRial":50000000000}'
curl -sS -X POST http://127.0.0.1:8088/api/sanhab/death-inquiry \
  -H 'Content-Type: application/json' \
  -d '{"nationalId":"0076543210","proposedCapital":5000000000}'
curl -sS -X POST http://127.0.0.1:8088/api/sanhab/vehicle-inquiry \
  -H 'Content-Type: application/json' \
  -d '{"plate":"21الف12345","vin":"IRVINDEMO001"}'
curl -sS -X POST http://127.0.0.1:8088/api/sanhab/unique-code \
  -H 'Content-Type: application/json' \
  -d '{"policyNumber":"TP-1404-DEMO-001","computerCode":"BN-DEMO-99"}'
curl -sS 'http://127.0.0.1:8088/api/sanhab/unique-code?policyNumber=TP-1404-DEMO-001'
curl -sS -X POST http://127.0.0.1:8088/api/sanhab/export-queue \
  -H 'Content-Type: application/json' \
  -d '{"kind":"issuance","payload":{"policyNumber":"TP-1404-DEMO-001"}}'
curl -sS http://127.0.0.1:8088/api/sanhab/export-queue
curl -sS -X POST http://127.0.0.1:8088/api/sanhab/export/run -H 'Content-Type: application/json' -d '{}'
```

## فایل‌ها
- `vps/sanhab.py` · wire در `vps/app.py` (additive)
- `vps/migrations/006_sanhab_m5.sql`
- `vps/test_sanhab.py`
- `src/lib/sanhab.ts` · `src/lib/sanhab.test.ts`
- `src/routes/sanhab.tsx` · لینک در `src/components/app-shell.tsx`
- Drop-in: `/workspace/shared/fasihi-sanhab-m5.py` + `SANHAB_M5_MERGE.md`

## محدودیت‌ها
Excel HOLD · UI shell/theme HOLD · بدون secret · بدون wipe · بدون شبکه سنهاب · Web tar HOLD
M1 (`sales-network`) · M2 (`sima-zar`) · M3 (`omid-pension`) · M4 (`group-health`) حفظ — شاخه از `feat/group-health-m4` (ae6b870).
