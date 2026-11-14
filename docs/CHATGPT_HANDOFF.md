# Fasihi CRM — ChatGPT / Grok Bot Handoff Brief
**آخرین به‌روزرسانی:** 2026-09-11 (Asia/Tehran) — بعد از import فاز ۱–۷ + معیار هویت زمرد/طلا
**ریپو:** https://github.com/Ramezani0/fasihi-crm
**Product Owner:** امیرحسین رمضانی — نمایندگی بیمه کارآفرین **۳۰۴۵** (فاطمه فصیحی)
**لایو:** https://www.fasihicrm.ir · VPS `185.204.197.49`

> راز، پسورد، و CSV خام مشتری داخل گیت نیست. این سند + کلون ریپو کافی است برای ادامه.

---

## وضعیت فعلی (FACT)
| متریک | قبل از import ۱۸ فایل | بعد از فاز ۱–۷ |
|--|--|--|
| customers | 1352 | **1526** |
| policies | 3499 | **9446** |
| installments | 3112 | **27485** |

- UI فاز ۲ (`a5b5be8`): store از `GET /api/data`؛ mock fallback اگر API نیاید؛ **mutation هنوز local** (ذخیره پایدار ندارد)
- `customers.legal_entity_id` اضافه شد (شناسه ۱۱رقمی حقوقی)
- `source_system=fasihicrm`
- فاز ۸ (وصول کلی تجمیعی ۳۴ ردیف) = **HOLD**
- ۱۸ فایل import شده؛ لود جدید لازم نیست
- بک‌آپ VPS `95.38.182.128` بی‌دلیل دست نخورده

### تصمیم UL
ترکیبی: آخرین نسخه per کد رایانه → policies (+2332)؛ همه 12709 تراکنش → تاریخچه اقساط/الحاقیه.

### قفل‌های import
- split ستون `نام-کدملی` قبل از ورود
- یکی از جفت تاخیر ۷۰۰؛ یکی از پزشکان xlsx/csv
- بدون wipe / حذف کور؛ upsert با ON CONFLICT
- شناسه و موبایل به‌صورت string با صفر اول

---

## محصول / استک / اولویت
CRM فارسی RTL: مشتریان، بیمه‌نامه‌ها، اقساط، پایپلاین، داشبورد تمدید، import اکسل، **پرونده ۳۶۵** (نمای کامل پرونده).

استک: TanStack Start + React 19 + Tailwind 4 + Bun · Postgres · Docker + Caddy
اولویت: حفظ داده > پایداری > صحت > سرعت > UX
۳D فقط login + dashboard hero

نقش دمو: ceo/manager/sales/accounting — چیپ فقط username؛ هر رمز غیرخالی OK

---

## هویت بصری قفل‌شده (PO — 2026-09-11)
PO خواست زیباترین سایت بیمه‌ای با تم سه‌بعدی، **سبز زمردی + طلایی**، نوشته‌های طلایی، **تم تیره و روشن**، و **لوگوی رسمی بیمه کارآفرین همه‌جا**.

| نقش | مقدار |
|--|--|
| زمرد رسمی | `#007440` |
| طلای رسمی | `#FCBC00` / عنوان تیره `#E8C547` / عنوان روشن `#8F6E12` |
| پس‌زمینه تیره | `#050806` |
| کاغذ روشن | `#F4EFE0` |
| لوگو | `public/brand/karafarin-logo.png` |
| پیش‌نمایش معیار | `docs/design-preview/` |

جزئیات اجرا: [DESIGN_EMERALD_GOLD.md](./DESIGN_EMERALD_GOLD.md)
پرامپت کپی Grok Bot: [GROK_BOT_PROMPT.md](./GROK_BOT_PROMPT.md)

افکت دکمه هنوز در cloud agent است — PRهای [\#9](https://github.com/Ramezani0/fasihi-crm/pull/9) و [\#10](https://github.com/Ramezani0/fasihi-crm/pull/10)؛ بعد از merge دیپلوی.

---

## کار بعدی پیشنهادی
1. اعمال هویت زمرد/طلا + لوگو رسمی + تم تیره/روشن روی **همین ریپو لایو** (نه وایپ، نه ری‌اسکفلد)
2. QA بستن runtime/نقش‌ها روی baseline 1526/9446/27485
3. پرونده ۳۶۵: نمایش `legal_entity_id` + تاریخچه UL
4. mutation پایدار روی API (الان local)
5. reduced-motion / SVG fallback برای ۳D
6. auth واقعی
7. SMS یادآوری بعد از پایداری

---

## پرامپت Grok Bot
متن آماده در [GROK_BOT_PROMPT.md](./GROK_BOT_PROMPT.md).
