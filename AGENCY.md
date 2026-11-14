# Agency 3045 — Fasihi CRM branding & identity brief

FACT brief for agency branding. No secrets, passwords, or CSV payloads in this file.

---

## هویت نمایندگی / Agency identity

| FA | EN |
|---|---|
| **بیمه‌گر:** بیمه کارآفرین | **Insurer:** Karafarin Insurance (Iran) |
| **کد نمایندگی:** ۳۰۴۵ | **Agency code:** 3045 |
| **نماینده:** خانم فاطمه فصیحی | **Representative:** Fatemeh Fasihi |
| **محصول:** CRM فصیحی (Fasihi CRM) | **Product:** Fasihi CRM |
| **دامنه تولید:** https://www.fasihicrm.ir | **Production domain:** https://www.fasihicrm.ir |
| **دمو زنده:** https://fasihi-crm.lovable.app | **Live demo:** https://fasihi-crm.lovable.app |
| **ریپوی خصوصی:** https://github.com/Ramezani0/fasihi-crm | **Private GitHub:** https://github.com/Ramezani0/fasihi-crm (partial Lovable export ~80 files) |

**Product Owner:** Amirhossein Ramezani — کارگزاری / شبکه فروش بیمه کارآفرین؛ نه فقط توسعه‌دهنده.

---

## پیشنهاد کپی برندینگ / Branding copy recommendations

### عنوان (Title)
**FA:** CRM فصیحی
**EN:** Fasihi CRM

### زیرعنوان (Subtitle)
**FA:** مدیریت هوشمند بیمه‌نامه، اقساط و مشتریان — نمایندگی ۳۰۴۵ بیمه کارآفرین
**EN:** Smart policy, installment & customer management — Karafarin Insurance Agency 3045

### خط فوتر نمایندگی (Footer agency line)
**FA:** نمایندگی بیمه کارآفرین کد ۳۰۴۵ — خانم فاطمه فصیحی | CRM فصیحی
**EN:** Karafarin Insurance Agency 3045 — Fatemeh Fasihi | Fasihi CRM

### تگ‌لاین کوتاه (optional tagline)
**FA:** اقساط معوق، یادآوری تمدید، گزارش مدیریتی
**EN:** Overdue installments, renewal reminders, management reports

Design cues (existing product): navy / teal / emerald, limited glassmorphism, RTL Persian; 3D emblem only on login / dashboard hero.

---

## زیرساخت زنده (FACT) / Live infrastructure

### Production VPS (data already loaded)
- Host: `95.38.182.128` — Ubuntu 24.04, app dir `/opt/fasihi`
- Postgres counts: **1352** customers / **3499** policies / **3112** installments
- Containers: `fasihi-caddy`, `fasihi-db` (postgres:16-alpine, `127.0.0.1:5432`), `fasihi-api` (`:8088`), `fasihi-web` (`:3000`)
- Credentials live only on VPS (`/opt/fasihi/db.env`, chmod 600) — **never commit**

### New VPS (provisioned by Amir; not yet primary)
- Host: `185.204.197.49`
- SSH: **publickey-only** for now — no password login assumed
- Do not migrate production data here until PO explicitly asks and access is verified

### DNS note (2026-09-11)
Public `fasihicrm.ir` / `www` currently resolve to `185.10.75.58` (cPanel) — 404. App is healthy on `95.38.182.128`. Point Cloudflare A `@` and `www` to `95.38.182.128` (proxy off).

---

## قوانین قفل‌شده / Locked rules

1. **`source_system`** = exact string `fasihicrm` on policies and installments
2. **CSV encoding:** UTF-8-SIG; do not invent leading zeros on mobiles
3. **No wipe:** never TRUNCATE / wipe as a first bugfix
4. **No reimport** unless Amir explicitly asks
5. Phone is not required on all records
6. Duplicate detection must not blindly delete
7. Priority: data preservation → stability → correctness → performance → UX → appearance
8. Never commit secrets, CSV dumps, or passwords to git

---

## گام‌های بعدی ساخت / Next build steps

1. Fix DNS: `@` and `www` → `95.38.182.128` (DNS only)
2. Complete Lovable source parity (~80 → ~107 files) before large UI work
3. Wire `src/lib/store.tsx` to `/api/data` (or Postgres) — stop serving in-memory demo as production UI
4. Fix known mapping bugs (kind/سواری→شخص ثالث, holder_name, computer_code, empty city as `—`, Persian status)
5. Agency branding 3045 / Fatemeh Fasihi on login + footer
6. QA https://www.fasihicrm.ir counts + identifier leading zeros — **do not reimport**
7. New VPS `185.204.197.49`: key-based access when PO requests cutover

---

## Out of scope for this brief

Customer CSVs, SQL batches, SSH/DB passwords, and any credential material stay off git and out of this file.
