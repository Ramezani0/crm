# M6 — بایگانی / DMS (Document Management & Physical Archive)

تاریخ: ۲۰۲۶-۰۹-۲۴ · وضعیت: اسکلت + آپلود پایدار فایل · نمایندگی ۳۰۴۵

## خلاصه
ماژول مدیریت اسناد فیزیکی و دیجیتال (DEMO stub — **بدون بیومتریک سخت‌افزاری و بدون OCR واقعی**):
- **بارکد/QR بایگانی فیزیکی:** تخصیص بارکد `DMS-BR…-SH…-RW…-BN…-HEX8` + آدرس انبار (شعبه، قفسه، ردیف، زونکن)
- **فرم پیشنهاد + امضا stub:** لمس (strokes) یا اثرانگشت stub + **هش SHA-256** از payload کاننیکال برای جلوگیری از دستکاری
- **OCR فارسی stub:** `national_id_card | birth_certificate | health_booklet | accident_sketch` → فیلدهای پرونده (بدون ML)

## Import / Eng-only (اجباری)

**DMS در این بچ اکسل نیست** → Eng-module-only تا اکسل برسد.

منابع (cite):
- `/workspace/shared/ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md`
- `/workspace/shared/MODULE_FORMULA_IMPORT_LOCKS_20260924.md` (Sanhab / DMS / Loyalty / Branch = Eng-only)
- Brief: `KARAFARIN_CORE_MODULES_BRIEF_20260924.md` ماژول ۶
- Research: `insurance-crm-modules-gemini-20260924.txt` (~3684–3691, 865–867, 3996+)

### شکل لینک آینده
`policy_number` · `policyholder_code` · `national_id` · `case_365` / `پرونده_365` · تاریخ جلالی **TEXT** `yyyy/mm/dd` (بدون Gregorian)

**Invent نکردن** مقادیر `insurance_type` خارج از enum قفل‌شدهٔ Import.

Excel **HOLD** تا `WIPE_GO` · بدون wipe.

## API
| Method | Path |
|--------|------|
| GET | `/api/dms/meta` |
| POST | `/api/dms/archive/assign` `{dossierKey, branch, shelf, row, binder}` |
| GET | `/api/dms/archive?barcode=` / `?dossierKey=` |
| GET | `/api/dms/archives` |
| POST | `/api/dms/documents` `{dossierKey, kind, meta?}` |
| GET | `/api/dms/documents/{id}` (includes hash) |
| POST | `/api/dms/sign` `{documentId, method:touch\|fingerprint, payloadStub}` |
| POST | `/api/dms/ocr` `{docType, imageMeta?, stubText?}` |
| GET | `/api/dms/ocr/{jobId}` |
| GET | `/api/dms/files?customerId=` (durable → `documents.py`) |
| POST | `/api/dms/files` `{customerId, category, content/base64, title?}` |
| GET | `/api/dms/files/{id}/file` |
| POST | `/api/dms/files/{id}/delete` (soft) |

Store در حافظه + SQL اختیاری. بدون wipe به customers/policies/installments/M1–M5. بدون سخت‌افزار بیومتریک / بدون ML.

## دیتابیس
`vps/migrations/007_dms_m6.sql` — جداول:
`archive_locations`, `documents`, `signatures`, `ocr_jobs`, `document_hashes`
(ایدمپوتنت؛ Jalali TEXT؛ `case_365` JSONB؛ بدون دست‌زدن به CRM)

## فرانت
- مسیر: `/dms`
- منو: **سایر ← بایگانی** (secondary، `tools.view`)
- RTL داخل AppShell · KPI تخت CSS · بدون Three.js
- بنر DEMO · شِل/تم: HOLD

## VERIFY
```bash
cd vps && python3 -m unittest test_dms -v
bun test src/lib/dms.test.ts

# optional live API (if app listening):
curl -sS http://127.0.0.1:8088/api/dms/meta | head
curl -sS -X POST http://127.0.0.1:8088/api/dms/archive/assign \
  -H 'Content-Type: application/json' \
  -d '{"dossierKey":"D-1","branch":"3045","shelf":"A1","row":"03","binder":"Z12"}'
curl -sS 'http://127.0.0.1:8088/api/dms/archive?dossierKey=D-1'
curl -sS -X POST http://127.0.0.1:8088/api/dms/documents \
  -H 'Content-Type: application/json' \
  -d '{"dossierKey":"D-1","kind":"proposal","meta":{"plan":"omid"}}'
curl -sS -X POST http://127.0.0.1:8088/api/dms/sign \
  -H 'Content-Type: application/json' \
  -d '{"documentId":1,"method":"touch","payloadStub":[{"x":1,"y":2}]}'
curl -sS http://127.0.0.1:8088/api/dms/documents/1
curl -sS -X POST http://127.0.0.1:8088/api/dms/ocr \
  -H 'Content-Type: application/json' \
  -d '{"docType":"national_id_card","stubText":"name:سارا|کدملی:0011223344"}'
```

## فایل‌ها
- `vps/dms.py` · wire در `vps/app.py` (additive)
- `vps/migrations/007_dms_m6.sql`
- `vps/test_dms.py`
- `src/lib/dms.ts` · `src/lib/dms.test.ts`
- `src/routes/dms.tsx` · لینک در `src/components/app-shell.tsx`
- Drop-in: `/workspace/shared/fasihi-dms-m6.py` + `DMS_M6_MERGE.md`

## فایل پایدار (P1 contract)
- Table: `customer_documents` · Volume: `DOCUMENTS_ROOT` default `/opt/fasihi/documents`
- Types: PDF / JPG / PNG / WEBP / GIF · Max: `DOCUMENT_MAX_BYTES` (۸ MiB)
- UI: بخش «فایل‌های بایگانی (پایدار)» روی `/dms` — OCR همچنان stub
- DevOps: bind-mount volume؛ بدون wipe

## محدودیت‌ها
Excel HOLD · UI shell/theme HOLD · بدون secret · بدون wipe · بدون بیومتریک واقعی · بدون ML · Web tar HOLD
M1 (`sales-network`) · M2 (`sima-zar`) · M3 (`omid-pension`) · M4 (`group-health`) · M5 (`sanhab`) حفظ — شاخه از `feat/sanhab-m5` (f9bce2b).
