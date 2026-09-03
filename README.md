# CRM فصیحی (Fasihi CRM)

سامانه فارسی RTL مدیریت بیمه‌گذار، بیمه‌نامه و اقساط.

## وضعیت داده واقعی (VPS)

- دامنه: https://www.fasihicrm.ir  
- API: `/api/health` → ۱۳۵۲ مشتری / ۳۴۹۹ بیمه‌نامه / ۳۱۱۲ قسط  
- ورود دمو: `ceo` / `۱۲۳۴۵۶`

## توسعه محلی

```bash
bun install
bun run dev
```

UI از `/api/data` (همان‌origin) می‌خواند. برای توسعه محلی، API را پروکسی کنید یا از دموی داخلی به‌عنوان fallback استفاده می‌شود.

## استقرار روی VPS (۱GB RAM)

بیلد را روی ماشین قوی انجام دهید؛ روی VPS فقط image را load کنید.

```bash
# روی ماشین بیلد:
NITRO_PRESET=bun bun run build
docker build -f Dockerfile.runtime -t fasihi-crm:local .
docker save fasihi-crm:local | gzip > fasihi-crm-local.tar.gz

# روی VPS:
gunzip -c fasihi-crm-local.tar.gz | docker load
docker compose -f deploy/docker-compose.app.yml up -d
# Caddy: deploy/Caddyfile → پروکسی / به :3000 و /api و /data به API
```

جزئیات بیشتر: [deploy/README.md](deploy/README.md)

## نکات مهم

- `kind` خام می‌ماند (سواری ≠ عمر).
- `holderName` و `statusLabel` فارسی از فایل/دیتابیس نمایش داده می‌شوند.
- سلول خالی → `—`
- صفر اول شناسه/موبایل حدس زده یا pad نمی‌شود.
- رمز VPS/DB را در گیت نگذارید.
