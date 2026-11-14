# Karafarin Modules M1–M8 — DevOps INDEX

تاریخ: ۲۰۲۶-۰۹-۲۴ · نمایندگی ۳۰۴۵ · Fasihi CRM
هدف: merge/deploy اسکلت ۸ ماژول تکمیلی بدون wipe و بدون تعویض web مگر CoS HOLD را بردارد.

## قفل‌ها / Handoff (اجباری)
- `/workspace/shared/ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md`
- `/workspace/shared/MODULE_FORMULA_IMPORT_LOCKS_20260924.md`
- Brief: `/workspace/shared/KARAFARIN_CORE_MODULES_BRIEF_20260924.md`
- Research: `/workspace/shared/research/insurance-crm-modules-gemini-20260924.txt`

**صریح:** do not wipe · do not swap web tar unless CoS lifts HOLD · DEMO only · no secrets.

## Checkout tip chain (M1→M8)

```
M1  feat/sales-network-m1  cd48dd33ffa7647b05a8ace0d5d6100408c0cf42
M2  feat/sima-zar-m2  b4dc4fc5857a62378606d386d34bbe80a44f9611
M3  feat/omid-pension-m3  4cf28791b195c8827a79b83ed2008f0d5eb6c259
M4  feat/group-health-m4  ae6b870dc4134b954b5a7a323485501c6b80e8c3
M5  feat/sanhab-m5  f9bce2bfc7c30aaa067d60b8737ef183cb302256
M6  feat/dms-m6  88e093decebe6e8c7e77b0b02d6c8f621de41e68
M7  feat/loyalty-m7  6f22afc7c61a204e6711b11cda4680b7f73bdacf
M8  feat/branch-ops-m8  450f079288f036a614d8957453851f11c12c678b
```

Linear feat commits on tip history:
```
cd48dd3 M1 sales-network
b4dc4fc M2 sima-zar
4cf2879 M3 omid-pension
ae6b870 M4 group-health
f9bce2b M5 sanhab
3c4a3b7 M6 dms (+ 88e093d MERGE docs)
6f22afc M7 loyalty
f9de8b7 M8 branch-ops
```

## Merge order recommendation

1. Apply migrations **in order**: `002` → `003` → `004` → `005` → `006` → `007` → `008` → `009` (all idempotent; no DELETE/wipe).
2. Drop-in each `fasihi-*-mN.py` next to live `app.py` **or** deploy branch tip that already wires routes.
3. Wire `app.py` additively: `import <mod>` + `path.startswith("/api/...")` → `handle_request` (GET/POST; M1 also PATCH).
4. Frontend: keep shell/theme HOLD; only additive routes + secondary nav labels.
5. **Do not** replace web tar / `dist` unless CoS lifts HOLD.
6. **Do not** call wipe / Excel import until CoS `WIPE_GO`.

## GH_TOKEN / PR
GH_TOKEN present in agent env but PR may still be blocked by org/SSO/permissions — treat PR as optional; prefer artifact+branch handoff if push/PR fails.

## Module cards

### M1 — شبکه فروش / Sales Network / Agent Hierarchy
- **Branch:** `feat/sales-network-m1`
- **Tip SHA:** `cd48dd33ffa7647b05a8ace0d5d6100408c0cf42`
- **Drop-in py:** `/workspace/shared/fasihi-sales-network-m1.py`
- **sha256(py):** `d7609370f193158fef788bf8d75f302b7127c4c16639a752a44ab82af5fb60f3`
- **MERGE.md:** `/workspace/shared/SALES_NETWORK_M1_MERGE.md` ✅
- **Migration:** `vps/migrations/002_sales_network_m1.sql` (also `/workspace/shared/002_sales_network_m1.sql` when copied)
- **API prefix:** `/api/sales-network`
- **UI route:** `/sales-network` · nav «شبکه فروش» (secondary / سایر)
- **HOLD:** Excel/wipe HOLD · web tar HOLD · DEMO rates

### M2 — سیما زر / Sima Zar Gold Savings
- **Branch:** `feat/sima-zar-m2`
- **Tip SHA:** `b4dc4fc5857a62378606d386d34bbe80a44f9611`
- **Drop-in py:** `/workspace/shared/fasihi-sima-zar-m2.py`
- **sha256(py):** `b3f8c490503366b684097000bdc163f05720a9cfa227c70821366dfcc24335ee`
- **MERGE.md:** `/workspace/shared/SIMA_ZAR_M2_MERGE.md` ✅
- **Migration:** `vps/migrations/003_sima_zar_m2.sql` (also `/workspace/shared/003_sima_zar_m2.sql` when copied)
- **API prefix:** `/api/sima-zar`
- **UI route:** `/sima-zar` · nav «سیما زر» (secondary / سایر)
- **HOLD:** Excel/wipe HOLD · web tar HOLD · rate stub DEMO · loan block

### M3 — امید بازنشستگی / Omid Pension
- **Branch:** `feat/omid-pension-m3`
- **Tip SHA:** `4cf28791b195c8827a79b83ed2008f0d5eb6c259`
- **Drop-in py:** `/workspace/shared/fasihi-omid-pension-m3.py`
- **sha256(py):** `fb2519c5d5b7ef86ad687ed79d12107b11231a04cfb83b74fdbb6d79c55db7cf`
- **MERGE.md:** `/workspace/shared/OMID_PENSION_M3_MERGE.md` ✅
- **Migration:** `vps/migrations/004_omid_pension_m3.sql` (also `/workspace/shared/004_omid_pension_m3.sql` when copied)
- **API prefix:** `/api/omid-pension`
- **UI route:** `/omid-pension` · nav «امید بازنشستگی» (secondary / سایر)
- **HOLD:** Excel/wipe HOLD · web tar HOLD · 10% compound DEMO · PoL stub

### M4 — درمان گروهی / Group Health
- **Branch:** `feat/group-health-m4`
- **Tip SHA:** `ae6b870dc4134b954b5a7a323485501c6b80e8c3`
- **Drop-in py:** `/workspace/shared/fasihi-group-health-m4.py`
- **sha256(py):** `824ca443f9aee051553ab0e5a999e4aec447311b38679e607c79bc0b14630146`
- **MERGE.md:** `/workspace/shared/GROUP_HEALTH_M4_MERGE.md` ✅
- **Migration:** `vps/migrations/005_group_health_m4.sql` (also `/workspace/shared/005_group_health_m4.sql` when copied)
- **API prefix:** `/api/group-health`
- **UI route:** `/group-health` · nav «درمان گروهی» (secondary / سایر)
- **HOLD:** Excel/wipe HOLD · web tar HOLD · tariff/OCR stub · no real hospital API

### M5 — سنهاب / Sanhab / Bime Markazi
- **Branch:** `feat/sanhab-m5`
- **Tip SHA:** `f9bce2bfc7c30aaa067d60b8737ef183cb302256`
- **Drop-in py:** `/workspace/shared/fasihi-sanhab-m5.py`
- **sha256(py):** `5c153138f45e1ac44703a84e619b45442b0edc22fa2204efbb581bcea3152fac`
- **MERGE.md:** `/workspace/shared/SANHAB_M5_MERGE.md` ✅
- **Migration:** `vps/migrations/006_sanhab_m5.sql` (also `/workspace/shared/006_sanhab_m5.sql` when copied)
- **API prefix:** `/api/sanhab`
- **UI route:** `/sanhab` · nav «سنهاب» (secondary / سایر)
- **HOLD:** Excel/wipe HOLD · web tar HOLD · no real Sanhab API · VIN/unique-code DEMO

### M6 — بایگانی / DMS Archive
- **Branch:** `feat/dms-m6`
- **Tip SHA:** `88e093decebe6e8c7e77b0b02d6c8f621de41e68`
- **Drop-in py:** `/workspace/shared/fasihi-dms-m6.py`
- **sha256(py):** `dcce40dbe53914d7c99a86318bd427d81d613963e8cc002edcc3f4331f0acd04`
- **MERGE.md:** `/workspace/shared/DMS_M6_MERGE.md` ✅
- **Migration:** `vps/migrations/007_dms_m6.sql` (also `/workspace/shared/007_dms_m6.sql` when copied)
- **API prefix:** `/api/dms`
- **UI route:** `/dms` · nav «بایگانی» (secondary / سایر)
- **HOLD:** Excel/wipe HOLD · web tar HOLD · OCR stub · e-sign hash DEMO

### M7 — باشگاه / جشنواره / Loyalty & Campaign
- **Branch:** `feat/loyalty-m7`
- **Tip SHA:** `6f22afc7c61a204e6711b11cda4680b7f73bdacf`
- **Drop-in py:** `/workspace/shared/fasihi-loyalty-m7.py`
- **sha256(py):** `a6839cb112a862e7c346c4042fc9a1d5241de05249c0df48b3f0aba34e7420b5`
- **MERGE.md:** `/workspace/shared/LOYALTY_M7_MERGE.md` ✅
- **Migration:** `vps/migrations/008_loyalty_m7.sql` (also `/workspace/shared/008_loyalty_m7.sql` when copied)
- **API prefix:** `/api/loyalty`
- **UI route:** `/loyalty` · nav «باشگاه» (secondary / سایر)
- **HOLD:** Excel/wipe HOLD · web tar HOLD · DEMO points/coupons · no invent insurance_type

### M8 — عملیات شعبه / Branch Operations Desk
- **Branch:** `feat/branch-ops-m8`
- **Tip SHA:** `450f079288f036a614d8957453851f11c12c678b` (module feat commit; branch may have later docs-only commits)
- **Drop-in py:** `/workspace/shared/fasihi-branch-ops-m8.py`
- **sha256(py):** `3ed5fff69d0b38eeffa23856f5e49734400b74b6a84b26dda460eab61b3802f1`
- **MERGE.md:** `/workspace/shared/BRANCH_OPS_M8_MERGE.md` ✅
- **Migration:** `vps/migrations/009_branch_ops_m8.sql` (also `/workspace/shared/009_branch_ops_m8.sql` when copied)
- **API prefix:** `/api/branch-ops`
- **UI route:** `/branch-ops` · nav «عملیات شعبه» (secondary / سایر)
- **HOLD:** Excel/wipe HOLD · web tar HOLD · serial DEMO · no real hologram/printer · Eng-only

## Global HOLD flags
- Web tar / frontend dist swap: **HOLD**
- Excel wipe/import: **HOLD** until CoS `WIPE_GO`
- No real Sanhab / OCR / hologram printer / hospital tariff feeds
- No invent `insurance_type` outside Import enum lock
- Jalali dates stay TEXT `yyyy/mm/dd` — no Gregorian rewrite

## VERIFY (smoke)
```bash
cd vps && python3 -m unittest test_sales_network test_sima_zar test_omid_pension \
  test_group_health test_sanhab test_dms test_loyalty test_branch_ops -q
bun test src/lib/sales-network.test.ts src/lib/sima-zar.test.ts \
  src/lib/omid-pension.test.ts src/lib/group-health.test.ts \
  src/lib/sanhab.test.ts src/lib/dms.test.ts src/lib/loyalty.test.ts \
  src/lib/branch-ops.test.ts
```

---
*INDEX for DevOps merge/deploy — Eng skeletons only. Cite ENG handoff + FORMULA_LOCKS.*
