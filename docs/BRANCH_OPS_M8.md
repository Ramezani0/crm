# M8 — کارتابل شعب / عملیات نمایندگی (Branch Operations)

تاریخ: ۲۰۲۶-۰۹-۲۴ · وضعیت: اسکلت (skeleton) · نمایندگی ۳۰۴۵

## خلاصه
ماژول کارتابل شعب و عملیات نمایندگی (DEMO stub):
- **موجودی اوراق بهادار:** قبض چاپی، برگه بیمه‌نامه، هولوگرام — چرخه `received_from_branch → assigned_to_issue → issued | voided`
- **مغایرت کارمزد/مالی stub:** مقایسه مبلغ دفتر نمایندگی با کارتابل شعبه → ردیف variance
- **چک بیمه‌گذار stub:** ثبت/فهرست چک‌های دریافتی

## Import / Eng-only (اجباری)

**Branch ops در این بچ اکسل نیست** → Eng-module-only تا اکسل برسد.

منابع (cite):
- `/workspace/shared/ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md`
- `/workspace/shared/MODULE_FORMULA_IMPORT_LOCKS_20260924.md` (Sanhab / DMS / Loyalty / Branch = Eng-only)
- Brief: `KARAFARIN_CORE_MODULES_BRIEF_20260924.md` ماژول ۸
- Research: `insurance-crm-modules-gemini-20260924.txt` (~3702–3707, 4421–4424)

سریال‌ها **DEMO**. بدون یکپارچه‌سازی چاپگر/هولوگرام واقعی.
Excel **HOLD** تا `WIPE_GO` · بدون wipe.

## API
| Method | Path |
|--------|------|
| GET | `/api/branch-ops/meta` |
| GET | `/api/branch-ops/stock` |
| POST | `/api/branch-ops/stock/receive` `{kind, serialFrom, serialTo, branchCode}` |
| POST | `/api/branch-ops/stock/issue` `{serial, policyNumber?}` |
| POST | `/api/branch-ops/stock/void` `{serial, reason}` |
| GET | `/api/branch-ops/variances` |
| POST | `/api/branch-ops/variances` `{agentCode, agencyAmount, branchAmount, note?}` |
| GET/POST | `/api/branch-ops/checks` |

`kind`: `receipt` \| `policy_sheet` \| `hologram`  
Store در حافظه + SQL اختیاری. بدون wipe به customers/policies/installments/M1–M7.

## دیتابیس
`vps/migrations/009_branch_ops_m8.sql` — جداول:
`paper_stock`, `paper_movements`, `commission_variances`, `incoming_checks`  
(ایدمپوتنت؛ Jalali TEXT؛ بدون دست‌زدن به CRM)

## فرانت
- مسیر: `/branch-ops`
- منو: **سایر ← عملیات شعبه** (secondary، `tools.view`)
- RTL داخل AppShell · KPI تخت CSS · بدون Three.js
- بنر DEMO · شِل/تم: HOLD

## VERIFY
```bash
cd vps && python3 -m unittest test_branch_ops -v
bun test src/lib/branch-ops.test.ts

curl -sS http://127.0.0.1:8088/api/branch-ops/meta | head
curl -sS http://127.0.0.1:8088/api/branch-ops/stock
curl -sS -X POST http://127.0.0.1:8088/api/branch-ops/stock/receive \
  -H 'Content-Type: application/json' \
  -d '{"kind":"receipt","serialFrom":"REC-7001","serialTo":"REC-7003","branchCode":"BR-01"}'
curl -sS -X POST http://127.0.0.1:8088/api/branch-ops/stock/issue \
  -H 'Content-Type: application/json' \
  -d '{"serial":"REC-7001","policyNumber":"POL-DEMO"}'
curl -sS -X POST http://127.0.0.1:8088/api/branch-ops/stock/void \
  -H 'Content-Type: application/json' \
  -d '{"serial":"REC-7002","reason":"چاپ خراب DEMO"}'
curl -sS -X POST http://127.0.0.1:8088/api/branch-ops/variances \
  -H 'Content-Type: application/json' \
  -d '{"agentCode":"A-1","agencyAmount":1000000,"branchAmount":900000}'
curl -sS http://127.0.0.1:8088/api/branch-ops/checks
curl -sS -X POST http://127.0.0.1:8088/api/branch-ops/checks \
  -H 'Content-Type: application/json' \
  -d '{"checkNumber":"CHK-1","amountRial":5000000,"policyholderCode":"PH1"}'
```

## فایل‌ها
- `vps/branch_ops.py` · wire در `vps/app.py` (additive)
- `vps/migrations/009_branch_ops_m8.sql`
- `vps/test_branch_ops.py`
- `src/lib/branch-ops.ts` · `src/lib/branch-ops.test.ts`
- `src/routes/branch-ops.tsx` · لینک در `src/components/app-shell.tsx`
- Drop-in: `/workspace/shared/fasihi-branch-ops-m8.py` + `BRANCH_OPS_M8_MERGE.md`

## محدودیت‌ها
Excel HOLD · UI shell/theme HOLD · بدون secret · بدون wipe · Web tar HOLD  
M1–M7 حفظ — شاخه از `feat/loyalty-m7` (6f22afc).
