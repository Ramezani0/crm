# M1 — شبکه فروش (Agent Hierarchy & Multi-tier Commission)

تاریخ: ۲۰۲۵-۰۹-۲۴ · وضعیت: اسکلت (skeleton) · نمایندگی ۳۰۴۵

## خلاصه
درخت نمایندگان چندسطحی + پیش‌نمایش کارمزد صدور/وصول/نظارتی برای سال بیمه‌نامه ۱–۵ + مالیات تکلیفی نمونه.

## نقش‌ها
| id | برچسب |
|----|--------|
| `general` | جنرال |
| `ayeen96` | آیین۹۶ |
| `broker` | کارگزار |
| `development_manager` | مدیرتوسعه |
| `marketer` | بازاریاب |

## DEMO_DEFAULTS (نرخ حقوقی / اکچوئری نیستند)
- **صدور (issuance):** Y1 ۲۰٪ · Y2 ۱۵٪ · Y3 ۱۲٪ · Y4 ۱۰٪ · Y5 ۸٪
- **وصول (collection):** Y1 ۵٪ · Y2 ۴٪ · Y3 ۳٪ · Y4 ۲٪ · Y5 ۱٪
- **نظارتی (supervisory) بر اساس عمق بالادست:** ۱→۲٪ · ۲→۱٪ · ۳→۰٫۵٪ · ۴→۰٫۲۵٪ · ۵→۰٫۱٪ از حق بیمه
- **مالیات تکلیفی:** ۱۰٪ از کارمزد ناخالص هر سهم

قبل از پروداکشن با نرخ‌های حقوقی جایگزین شود.

## API
| Method | Path |
|--------|------|
| GET | `/api/sales-network/meta` |
| GET/POST | `/api/sales-network/agents` |
| GET/PATCH | `/api/sales-network/agents/:id` |
| GET | `/api/sales-network/tree` |
| GET | `/api/sales-network/commission-rules` |
| POST | `/api/sales-network/commission/preview` body `{premiumRial,policyYear,agentId}` |

Seed دمو در حافظه اگر خالی باشد. بدون تماس به customers/policies/installments.

## دیتابیس
`vps/migrations/002_sales_network_m1.sql` — جداول `sales_agents`, `commission_rules`, `commission_settings` (ایدمپوتنت، بدون wipe).

## فرانت
- مسیر: `/sales-network`
- منو: **سایر ← شبکه فروش** (secondary، `tools.view`)
- RTL tree داخل AppShell · KPI تخت CSS · بدون Three.js/canvas · SectionCard موجود
- شِل/تم: HOLD

## VERIFY
```bash
curl -sS http://127.0.0.1:8088/api/sales-network/tree | head
curl -sS http://127.0.0.1:8088/api/sales-network/commission-rules | head
curl -sS -X POST http://127.0.0.1:8088/api/sales-network/commission/preview \
  -H 'Content-Type: application/json' \
  -d '{"premiumRial":10000000,"policyYear":1,"agentId":5}'
```

## فایل‌ها
- `vps/sales_network.py` · wire در `vps/app.py`
- `vps/test_sales_network.py`
- `src/lib/sales-network.ts` · `src/lib/sales-network.test.ts`
- `src/routes/sales-network.tsx` · لینک در `src/components/app-shell.tsx`
- Drop-in: `/workspace/shared/fasihi-sales-network-m1.py` + `SALES_NETWORK_M1_MERGE.md`

## محدودیت‌ها
Excel HOLD · UI shell/theme HOLD · بدون secret · بدون wipe
