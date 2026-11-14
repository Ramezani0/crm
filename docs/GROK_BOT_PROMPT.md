# پرامپت کامل — کپی برای Grok Bot

ریپو: https://github.com/Ramezani0/fasihi-crm
شروع از برنچ/PR: https://github.com/Ramezani0/fasihi-crm/pull/11 (`docs/grok-bot-handoff-20260911`)

متن زیر را عیناً به Grok Bot بده.

---

```
تو مهندس ارشد Fasihi CRM هستی. کار را روی ریپوی لایو تمام کن. اسکفلد جدید نساز.

════════════════════════════════════
۱) منبع حقیقت — به این ترتیب بخوان
════════════════════════════════════
ریپو: https://github.com/Ramezani0/fasihi-crm
شروع کار: checkout برنچ docs/grok-bot-handoff-20260911  یا  PR #11 را مبنا بگیر سپس از main ادغام نکن مگر لازم.
فایل‌ها:
1. docs/CHATGPT_HANDOFF.md
2. docs/DESIGN_EMERALD_GOLD.md
3. docs/GROK_HANDOFF.md
4. AGENCY.md  (کپی برند؛ شمارش قدیمی‌اش را نادیده بگیر)
5. CURSOR.md  (زیرساخت؛ شمارش قدیمی‌اش را نادیده بگیر)
6. docs/ARCHITECTURE.md
7. src/lib/brand.ts
8. src/lib/store.tsx
9. src/lib/types.ts
10. src/styles.css
11. src/routes/index.tsx  (ورود)
12. src/routes/dashboard.tsx
13. src/components/app-shell.tsx
14. src/components/emblem/*
15. src/components/ui/button.tsx

معیار تصویر (حتماً ببین):
- docs/design-preview/login-dark.png
- docs/design-preview/login-light.png
- docs/design-preview/dashboard-dark.png
- docs/design-preview/dashboard-light.png

لوگوی رسمی: public/brand/karafarin-logo.png
فاوآیکون پیشنهادی: public/favicon-karafarin.svg

اگر CHATGPT_HANDOFF با AGENCY.md/CURSOR.md در عدد یا VPS فرق داشت، FACT همین handoff برنده است.

════════════════════════════════════
۲) محصول و آدم‌ها
════════════════════════════════════
محصول: CRM فارسی RTL بیمه — مشتریان، بیمه‌نامه، اقساط، تمدید، پایپلاین، گزارش، وظایف، کاربران، پرونده ۳۶۵.
PO: امیرحسین رمضانی
نمایندگی: بیمه کارآفرین کد ۳۰۴۵ — خانم فاطمه فصیحی
دامنه لایو: https://www.fasihicrm.ir
دمو Lovable (قدیمی‌تر): https://fasihi-crm.lovable.app
Lovable project: b03d0b17-2002-4c2d-a2ca-9ecb7d4b9b9c
ریپو خصوصی است. تاریخچه را force-push / rebase / amend نکن — Lovable به git وصل است.

════════════════════════════════════
۳) استک
════════════════════════════════════
TanStack Start (file routes) + React 19 + Tailwind 4 + Bun
Postgres 16 · Docker · Caddy
فرانت: src/routes/* ، src/components/* ، src/lib/store.tsx
API پایتون روی VPS: vps/app.py  (مسیر زنده /opt/fasihi)
UI از GET /api/data می‌خواند (فاز ۲، commit a5b5be8). اگر API نباشد mock.
mutation هنوز local است — ذخیره پایدار روی API ندارد. این را در این تسک عوض نکن مگر PO بگوید.

════════════════════════════════════
۴) قفل سخت — نقض = شکست
════════════════════════════════════
- بدون wipe / TRUNCATE / حذف کور / re-import
- source_system باید دقیق رشتهٔ fasihicrm باشد
- شناسه و موبایل string؛ صفر اول را دور نریز
- CSV/رمز/اسرار را در گیت نگذار
- ۳D فقط login و dashboard hero — بقیه صفحات Three.js نگیر
- RTL فارسی، فونت Vazirmatn
- اولویت: حفظ داده > پایداری > صحت > سرعت > UX
- edit in place روی همین ریپو؛ اپ موازی نساز
- برنچ Lovable را force-push نکن

════════════════════════════════════
۵) FACT داده (۲۰۲۶-۰۹-۱۱) — این اعداد درست‌اند
════════════════════════════════════
customers = 1526
policies  = 9446
installments = 27485

قبل از import ۱۸ فایل: 1352 / 3499 / 3112
۱۸ فایل import شده. لود جدید لازم نیست.
فاز ۸ (وصول کلی تجمیعی ~۳۴ ردیف) = HOLD
legal_entity_id روی customers هست (شناسه ۱۱رقمی حقوقی).
UL: آخرین نسخه per کد رایانه → policies (+2332)؛ ۱۲۷۰۹ تراکنش → تاریخچه اقساط/الحاقیه.

UI لایو: a5b5be8 · asset index-BRjdIF-E.js
VPS فعلی اعلام‌شده برای دامنه: 185.204.197.49
بک‌آپ قدیمی 95.38.182.128 را بی‌دلیل دست نزن.

نقش دمو: ceo / manager / sales / accounting
چیپ ورود فقط username؛ هر رمز غیرخالی OK. Auth واقعی بعداً.

════════════════════════════════════
۶) PRهای باز — تداخل نساز
════════════════════════════════════
#11  همین بسته handoff + لوگو + معیار (مبنای تو)
#7   docs handoff import
#8   legalEntityId روی customers — اگر روی main نیست، رفتارش را نشکن
#9   glow/flash دکمه (آماده)
#10  draft همان افکت
#1   self-host :3000 /api/data

افکت دکمه را خودت در button.tsx پیاده کن اگر #9/#10 هنوز merge نشده.
منطق store و API را در این PR بازنویسی نکن.

════════════════════════════════════
۷) هویت قفل‌شده توسط PO (الان پیاده کن)
════════════════════════════════════
خواسته PO: زیباترین سایت CRM بیمه کارآفرین ایران.
- لوگوی رسمی بیمه کارآفرین همه‌جا
- سبز زمردی + طلایی
- نوشته‌های عنوان طلایی (بدنه باید خوانا بماند)
- تم تیره و روشن با سوئیچ
- حس سه‌بعدی روی ورود و داشبورد

رنگ:
  زمرد رسمی     #007440
  طلای لوگو     #FCBC00
  عنوان تیره    #E8C547   روی پس‌زمینه #050806
  عنوان روشن    #8F6E12   روی کاغذ     #F4EFE0
  کارت تیره     #121C16
  کارت روشن     #FFFCF4
  متن تیره      #F3EAD2
  متن روشن      #143322
  muted تیره    #C6B27A
  muted روشن    #6D5B28

تم:
  کلاس html.dark / html.light
  localStorage key: fasihi-theme
  اسکریپت FOUC در head
  سوئیچ در ورود + هدر/سایدبار
  color-scheme مطابق تم

لوگو همه‌جا:
  سایدبار، هدر موبایل، کارت ورود، هیرو داشبورد، فاوآیکون، فوتر، واترمارک خیلی کم‌رنگ روی بوم
  فایل: public/brand/karafarin-logo.png
  alt: لوگوی بیمه کارآفرین
  فاوآیکون را به public/favicon-karafarin.svg یا همان PNG وصل کن

۳D:
  فقط index (login) و dashboard hero
  نشان رسمی الماس کارآفرین (بافت لوگو یا هندسه زمرد+طلا)
  WebGL نیست یا prefers-reduced-motion → PNG/SVG همان لوگو
  ورود RTL: فرم در سمت start (راست)، ۳D/برند در سمت دیگر
  veil تیره روی سمت فرم باشد تا فرم خوانا بماند

دکمه:
  هاور: سایه طلایی نرم (glow)
  کلیک: flash کوتاه طلا / زمرد / جنگلی
  اگر prefers-reduced-motion: بدون transform/flash
  min tap 44px

تایپ:
  Vazirmatn
  h1/h2/اعداد KPI/نام برند = طلا
  بدنه = fg نه طلای مطلق (خوانایی)

════════════════════════════════════
۸) نقشه فایل — همین‌ها را ویرایش کن
════════════════════════════════════
src/styles.css                 توکن dark/light + gold + دکمه
src/routes/__root.tsx          اسکریپت تم، favicon، html class
src/lib/brand.ts               در صورت نیاز مسیر لوگو
src/components/app-shell.tsx   لوگو سایدبار + سوئیچ تم + عنوان طلا
src/routes/index.tsx           ورود: لوگو، ۳D، فرم راست، سوئیچ تم
src/routes/dashboard.tsx       هیرو ۳D + لوگو + KPI طلا
src/components/emblem/*        صحنه ۳D با نشان رسمی + fallback
src/components/ui/button.tsx   glow + flash
src/components/brand/          اگر لازم است Logo.tsx و ThemeToggle.tsx بساز
public/favicon.ico یا لینک به favicon-karafarin.svg

CSS فعلی هنوز navy/teal است. pallette را عوض کن، رفتار store را نه.

════════════════════════════════════
۹) تسک این دور — به ترتیب، تمامش کن
════════════════════════════════════
A. برنچ جدید از docs/grok-bot-handoff-20260911 بساز، مثلاً feat/emerald-gold-theme
   (اگر از main شروع می‌کنی، فایل‌های لوگو و docs را از PR #11 بیاور)
B. توکن‌ها و تم dark/light در src/styles.css
C. ThemeProvider + سوئیچ + FOUC
D. کامپوننت Logo با public/brand/karafarin-logo.png
E. لوگو در shell / login / dashboard / favicon / واترمارک ملایم
F. ۳D login+dashboard با نشان رسمی و fallback
G. فرم ورود RTL درست (فرم راست)
H. glow/flash دکمه + reduced-motion
I. عناوین و KPI طلایی؛ کنتراست تم روشن را چک کن
J. typecheck/build اگر در ریپو هست
K. PR آمادهٔ merge با توضیح فارسی کوتاه
L. داده، API، import، auth را در این PR دست نزن

════════════════════════════════════
۱۰) پذیرش
════════════════════════════════════
- ورود تیره و روشن شبیه معیار design-preview (نه کپی پیکسل؛ هویت یکی)
- لوگوی رسمی در ورود، سایدبار، داشبورد دیده می‌شود
- سوئیچ تم پایدار است (رفرش نپرد)
- ۳D فقط دو صفحه؛ بقیه بدون canvas
- reduced-motion لوگو را ثابت نشان می‌دهد
- نقش‌ها هنوز با username دمو وارد می‌شوند
- GET /api/data و اعداد لایو نشکند
- هیچ commit شامل CSV یا پسورد نیست
- force-push نشده

════════════════════════════════════
۱۱) بعد از تم (فقط اگر A–K تمام شد و وقت ماند)
════════════════════════════════════
پرونده ۳۶۵: legal_entity_id + تاریخچه UL را نشان بده.
mutation پایدار روی API را شروع نکن مگر در PR جدا.
SMS و auth واقعی خارج از این دور است.

حدس را از FACT جدا بنویس. رمز نگذار. اگر چیزی را نمی‌دانی بگو نمی‌دانم.
الان از تسک A شروع کن و تم زمرد/طلا را روی ریپوی لایو تمام کن.
```
