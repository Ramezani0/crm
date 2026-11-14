# پنل پیامک ایران پیامک + کارهای ضروری

## مسیرها (UI)
- `/sms-panel` — پنل پیامک (تنظیمات، تست اتصال، ارسال متن/پترن، صندوق)
- `/urgent-tasks` — کارهای ضروری (وضعیت‌ها + نشان خوانده/نخوانده)

## API
- `GET /api/sms-panel/settings` — تنظیمات ماسک‌شده
- `PUT /api/sms-panel/settings` — ذخیره دستی مدارک (رمز در پاسخ برنمی‌گردد)
- `POST /api/sms-panel/test-connection` — پینگ واقعی در صورت وجود مدارک
- `POST /api/sms-panel/send` — متن آزاد
- `POST /api/sms-panel/send-pattern` — پترن
- `GET /api/sms-panel/inbox` — صندوق ورودی (اسکلت/کش در صورت ابهام API)
- `POST /api/sms-panel/reply` — پاسخ به همان خط
- `GET|POST /api/urgent-tasks` — فهرست / ایجاد
- `POST /api/urgent-tasks/update` — تغییر وضعیت (پیامک خودکار)
- `POST /api/urgent-tasks/open` — علامت خوانده

## SMS_DRY_RUN
پیش‌فرض زنده: `SMS_DRY_RUN=0` (ارسال واقعی). برای آزمایش: `SMS_DRY_RUN=1`.
UI بنر آزمایشی را فقط وقتی سرور `dryRun: true` برگرداند نشان می‌دهد.
Aliases: `/api/sms/send` → `/api/sms-panel/send` (و send-pattern / reply / settings / inbox / test-connection).

## اسرار
فقط نام env در git: `IRANPAYAMAK_*` و فایل محلی gitignored `vps/sms-panel-secrets.json`.
