# Fasihi CRM — Final Handoff / بستهٔ نهایی تحویل

**تاریخ:** 2026-09-17 (Asia/Tehran)
**ریپو:** https://github.com/Ramezani0/fasihi-crm
**اساس:** `origin/main` @ `1b96439`
**قوانین:** بدون secret / token / password — فقط نام envها و FACTهای تأییدشده.

---

## Live

| Item | Value |
|------|--------|
| URL | https://www.fasihicrm.ir |
| Health counts | customers **1526** / policies **9446** / installments **27485** |
| Main tip (docs base) | `1b96439` — policies lite real `customerId` + calc unit |

**توجه / Note:** دارایی وب لایو را با artifact `da5320c` (build با `NITRO_PRESET=bun`) مقایسه کنید — مربوط به #31b که QA برای مسیر policies → dossier را **PASS** کرده است. اگر web لایو روی sha دیگری است، قبل از deploy بعدی verify کنید.

---

## Merged / live fixes

| PR | موضوع | وضعیت |
|----|--------|--------|
| [#30](https://github.com/Ramezani0/fasihi-crm/pull/30) | renewals UI slim window (trust `/api/renewals`) | **MERGED** → `197fef8` |
| [#35](https://github.com/Ramezani0/fasihi-crm/pull/35) / #31b | policies lite: real `customers.id` as `customerId` (never holderCode) | **MERGED** main `1b96439` — QA **PASS** |
| [#33](https://github.com/Ramezani0/fasihi-crm/pull/33) | premium adjustment calc + دیه ۱۴۰۵ | **VERIFIED live PASS** — calc unit روی main همراه `1b96439` («keep calc #33»); خودِ PR ممکن است هنوز open بماند |

---

## Open PRs

| PR | موضوع | نکته |
|----|--------|------|
| [#36](https://github.com/Ramezani0/fasihi-crm/pull/36) | premium-calc compare + Gemini proxy | Head `@ cbd02c9` — artifacts روی shared؛ model `gemini-2.0-flash` (ریسک Google **404** → mock fallback) |
| [#34](https://github.com/Ramezani0/fasihi-crm/pull/34) | Kara modules dry-run | UI/modules؛ CRM write **locked** |
| [#32](https://github.com/Ramezani0/fasihi-crm/pull/32) | Import skeleton | Live commit locked؛ `IMPORT_PIPELINE_DIR=/opt/fasihi/import-pipeline` |
| [#31](https://github.com/Ramezani0/fasihi-crm/pull/31) | older deeplink | ممکن است هنوز open باشد — **superseded by #35** |
| [#37](https://github.com/Ramezani0/fasihi-crm/pull/37) | holder_code backfill | dry-run then apply (از name «کد N») — در صف Next |

سایر PRهای قدیمی‌تر (SMS، staff admin، laws seed، …) خارج از scope این handoff؛ در صورت نیاز جداگانه اولویت‌بندی شوند.

---

## Env names only (هرگز value ننویسید)

### Kara (`KARA_*`)
- `KARA_API_BASE`
- `KARA_USER`
- `KARA_PASS`
- `KARA_AES_KEY`

### Premium AI (`PREMIUM_AI_*`)
- `PREMIUM_AI_PROVIDER`
- `PREMIUM_AI_API_KEY`
- `PREMIUM_AI_MODEL` (= `gemini-2.0-flash`)
- `PREMIUM_AI_BASE_URL`
- `PREMIUM_AI_API_VERSION`
- `PREMIUM_AI_AUTH_STYLE`

### Import
- `IMPORT_PIPELINE_DIR` (live path lock: `/opt/fasihi/import-pipeline`)
- `COS_IMPORT_LIVE` — **off**

---

## Shared artifacts pattern

روی box مشترک:

```text
/workspace/shared/fasihi-web-output-<sha>.tar.gz
/workspace/shared/fasihi-app-<sha>.py
```

مثال‌های موجود مرتبط با این handoff:
- `fasihi-web-output-da5320c.tar.gz` (+ `.sha256`) — #31b / policies→dossier QA PASS
- `fasihi-web-output-cbd02c9.tar.gz` + `fasihi-app-cbd02c9.py` — #36 premium-compare + Gemini proxy

**Build lock:** `NITRO_PRESET=bun` **required** برای web `.output` tarball.

---

## Next

1. Deploy **#36** بعد از CoS **GO** (web + api با هم)
2. Backfill `holder_code` از name «کد N» (PR #37 / dry-run → apply)
3. Lux **#15-light** motion — فقط login + dashboard
4. Robotics dry digest cron
5. Kara **#34** UI deploy dry-run؛ CRM write **locked**
6. اگر Gemini **404** ماند، model id را اصلاح کنید (`PREMIUM_AI_MODEL`)

---

## Design locks

- **3D فقط** روی login + dashboard
- جداول **flat** — بدون Three.js
- لوگو + کد نمایندگی **3045**
- `prefers-reduced-motion` → SVG / بدون motion سنگین

---

## Safety

- هیچ secret، token، یا password در این سند یا commit نیست.
- مقادیر env فقط روی VPS / secret store؛ اینجا فقط **نام** متغیرها.
- Import live و Kara write تا GO صریح CoS قفل‌اند.
