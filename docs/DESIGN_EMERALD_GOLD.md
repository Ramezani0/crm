# هویت زمرد و طلا — بیمه کارآفرین ۳۰۴۵

PO این را قفل کرد: سایت باید شبیه کنسول نمایندگی رسمی باشد، نه دموی استارتاپ.

پیش‌نمایش معیار (Grok Build، فقط جهت ظاهر — سورس لایو همین ریپو است):

| سطح | فایل |
|--|--|
| ورود تیره | [design-preview/login-dark.png](./design-preview/login-dark.png) |
| ورود روشن | [design-preview/login-light.png](./design-preview/login-light.png) |
| داشبورد تیره | [design-preview/dashboard-dark.png](./design-preview/dashboard-dark.png) |
| داشبورد روشن | [design-preview/dashboard-light.png](./design-preview/dashboard-light.png) |

لوگو: [`/public/brand/karafarin-logo.png`](../public/brand/karafarin-logo.png)
فاوآیکون پیشنهادی: [`/public/favicon-karafarin.svg`](../public/favicon-karafarin.svg)

## رنگ

| نقش | تیره | روشن |
|--|--|--|
| پس‌زمینه | `#050806` | `#F4EFE0` |
| سطح / کارت | `#121C16` | `#FFFCF4` |
| متن بدنه | `#F3EAD2` | `#143322` |
| عنوان طلا | `#E8C547` | `#8F6E12` |
| زمرد (اکشن) | `#007440` | `#007440` |
| طلای لوگو | `#FCBC00` | `#FCBC00` |
| muted | `#C6B27A` | `#6D5B28` |

عنوان‌ها، اعداد KPI، نام برند: طلایی.
متن بدنه طلایی مطلق نباشد — خوانایی اولویت دارد.

## تم
- کلاس روی `html`: `dark` یا `light`
- کلید `localStorage`: `fasihi-theme`
- سوئیچ در ورود و هدر/سایدبار
- جلوگیری از FOUC با اسکریپت کوتاه در `<head>`

## لوگو همه‌جا
سایدبار، هدر موبایل، کارت ورود، هیرو داشبورد، فاوآیکون، فوتر، واترمارک خیلی کم‌رنگ روی بوم اصلی.

## ۳D
فقط login و dashboard hero.
نشان رسمی به‌صورت الماس سه‌بعدی / صفحه بافت‌دار؛ اگر WebGL یا `prefers-reduced-motion` نبود → همان PNG/SVG.
بقیه صفحات عمق CSS دارند، نه Three.js.

## دکمه
هاور: سایه طلایی نرم.
کلیک: flash کوتاه طلا / زمرد / جنگلی (بدون افکت اگر reduced-motion).

## قفل اجرا
- Edit in place روی TanStack Start همین ریپو
- بدون wipe دیتابیس
- بدون force-push (Lovable)
- RTL فارسی، Vazirmatn
