import { buildPipelineSeed } from "./demo-pipeline";
import type {
  ActivityItem,
  AppUser,
  AuditEntry,
  Customer,
  DealActivity,
  Installment,
  Opportunity,
  NotificationItem,
  Policy,
  PolicyKind,
  Task,
} from "./types";

/** Deterministic PRNG so demo data is identical between server render and client. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FIRST = [
  "علی",
  "محمد",
  "رضا",
  "حسین",
  "مهدی",
  "امیر",
  "سعید",
  "فاطمه",
  "زهرا",
  "مریم",
  "نگار",
  "سمیرا",
  "الهام",
  "پریسا",
  "بهنام",
  "کیوان",
  "آرش",
  "شیما",
  "نیلوفر",
  "حامد",
];
const LAST = [
  "فصیحی",
  "محمدی",
  "احمدی",
  "رضایی",
  "کریمی",
  "موسوی",
  "حسینی",
  "صادقی",
  "نوروزی",
  "جعفری",
  "شریفی",
  "قاسمی",
  "اکبری",
  "زارعی",
  "رستمی",
  "بهرامی",
  "امینی",
  "فراهانی",
  "سلطانی",
  "کاظمی",
];
const CITIES = [
  "تهران",
  "مشهد",
  "اصفهان",
  "شیراز",
  "تبریز",
  "کرج",
  "اهواز",
  "قم",
  "رشت",
  "کرمان",
  "یزد",
  "ارومیه",
];
const COMPANIES = ["بیمه ایران", "بیمه پاسارگاد", "بیمه دی", "بیمه سامان", "بیمه معلم", "بیمه البرز", "بیمه کوثر"];
const KINDS: PolicyKind[] = [
  "شخص ثالث",
  "بدنه",
  "عمر و سرمایه‌گذاری",
  "درمان تکمیلی",
  "آتش‌سوزی",
  "مسئولیت",
];
const AGENTS = ["سمیرا کریمی", "بهنام رستمی", "نگار موسوی", "امیر صادقی"];

const DAY = 86400000;
/** Fixed "today" keeps demo data stable and reproducible. */
export const TODAY = new Date("2026-07-27T09:00:00.000Z");

const iso = (offsetDays: number) => new Date(TODAY.getTime() + offsetDays * DAY).toISOString();

export interface DemoData {
  customers: Customer[];
  policies: Policy[];
  installments: Installment[];
  tasks: Task[];
  notifications: NotificationItem[];
  activities: ActivityItem[];
  users: AppUser[];
  audit: AuditEntry[];
  opportunities: Opportunity[];
  dealActivities: DealActivity[];
}

export function buildDemoData(): DemoData {
  const rnd = makeRng(20260727);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

  const customers: Customer[] = Array.from({ length: 420 }, (_, i) => {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    return {
      id: `C-${1000 + i}`,
      fullName: name,
      nationalId: String(Math.floor(1000000000 + rnd() * 8999999999)),
      phone: `09${Math.floor(120000000 + rnd() * 79999999)}`,
      email: `user${1000 + i}@fasihi.ir`,
      city: pick(CITIES),
      status: rnd() > 0.82 ? "lead" : rnd() > 0.15 ? "active" : "inactive",
      segment: rnd() > 0.78 ? "حقوقی" : "حقیقی",
      agent: pick(AGENTS),
      createdAt: iso(-Math.floor(rnd() * 700)),
      note: rnd() > 0.7 ? "مشتری وفادار، تمدید سالانه انجام می‌شود." : undefined,
    };
  });

  const policies: Policy[] = [];
  const installments: Installment[] = [];

  customers.forEach((c, ci) => {
    const count = c.status === "lead" ? 0 : 1 + Math.floor(rnd() * 2);
    for (let p = 0; p < count; p++) {
      const start = -Math.floor(rnd() * 500);
      const premium = (5 + Math.floor(rnd() * 90)) * 1_000_000;
      const instCount = pick([2, 3, 4, 6, 12]);
      const policy: Policy = {
        id: `P-${policies.length + 5000}`,
        number: `${1400 + Math.floor(rnd() * 5)}/${100000 + ci * 7 + p}`,
        customerId: c.id,
        kind: pick(KINDS),
        company: pick(COMPANIES),
        premium,
        startDate: iso(start),
        endDate: iso(start + 365),
        status: start + 365 < 0 ? "expired" : rnd() > 0.94 ? "pending" : rnd() > 0.97 ? "cancelled" : "active",
        installmentCount: instCount,
      };
      policies.push(policy);

      const per = Math.round(premium / instCount / 1000) * 1000;
      for (let k = 0; k < instCount; k++) {
        const due = start + 30 * (k + 1);
        let status: Installment["status"];
        let paidAmount = 0;
        if (due < -5) {
          status = rnd() > 0.12 ? "paid" : "overdue";
        } else if (due < 0) {
          status = rnd() > 0.4 ? "paid" : rnd() > 0.5 ? "overdue" : "partial";
        } else {
          status = rnd() > 0.9 ? "partial" : "due";
        }
        if (status === "paid") paidAmount = per;
        if (status === "partial") paidAmount = Math.round((per * 0.4) / 1000) * 1000;

        installments.push({
          id: `I-${installments.length + 90000}`,
          policyId: policy.id,
          customerId: c.id,
          seq: k + 1,
          amount: per,
          paidAmount,
          dueDate: iso(due),
          status,
          payments:
            paidAmount > 0
              ? [
                  {
                    id: `PM-${installments.length}`,
                    amount: paidAmount,
                    date: iso(due - 1),
                    method: pick(["کارت به کارت", "درگاه بانکی", "نقدی", "چک"]),
                    by: pick(AGENTS),
                  },
                ]
              : [],
        });
      }
    }
  });

  const tasks: Task[] = Array.from({ length: 24 }, (_, i) => ({
    id: `T-${i + 1}`,
    title: pick([
      "پیگیری تمدید بیمه‌نامه شخص ثالث",
      "تماس با مشتری بابت قسط معوق",
      "ارسال پیش‌فاکتور بیمه درمان تکمیلی",
      "بازدید کارشناسی خسارت",
      "ثبت مدارک بیمه‌نامه آتش‌سوزی",
      "جلسه با نماینده شرکت بیمه",
    ]),
    dueDate: iso(-6 + Math.floor(rnd() * 20)),
    assignee: pick(AGENTS),
    priority: pick(["کم", "متوسط", "زیاد"] as const),
    done: rnd() > 0.65,
    relatedCustomerId: customers[Math.floor(rnd() * customers.length)].id,
  }));

  const notifications: NotificationItem[] = Array.from({ length: 12 }, (_, i) => ({
    id: `N-${i + 1}`,
    title: pick([
      "قسط معوق جدید ثبت شد",
      "بیمه‌نامه در آستانه انقضا",
      "پرداخت موفق ثبت شد",
      "درخواست صدور جدید",
      "گزارش ماهانه آماده است",
    ]),
    body: "برای مشاهده جزئیات وارد بخش مربوطه شوید.",
    date: iso(-Math.floor(rnd() * 12)),
    kind: pick(["info", "warning", "success", "danger"] as const),
    read: rnd() > 0.6,
  }));

  const activities: ActivityItem[] = Array.from({ length: 18 }, (_, i) => ({
    id: `A-${i + 1}`,
    actor: pick(AGENTS),
    action: pick(["ثبت پرداخت", "ویرایش مشتری", "صدور بیمه‌نامه", "ارسال پیامک یادآوری", "ثبت وظیفه"]),
    target: customers[Math.floor(rnd() * customers.length)].fullName,
    date: iso(-Math.floor(rnd() * 5)),
  }));

  const users: AppUser[] = [
    { id: "U-1", name: "مهدی فصیحی", username: "ceo", role: "ceo", email: "ceo@fasihi.ir", active: true, lastLogin: iso(-1) },
    {
      id: "U-2",
      name: "نگار موسوی",
      username: "manager",
      role: "internal_manager",
      email: "manager@fasihi.ir",
      active: true,
      lastLogin: iso(-2),
    },
    { id: "U-3", name: "سمیرا کریمی", username: "sales", role: "sales", email: "sales@fasihi.ir", active: true, lastLogin: iso(-1) },
    {
      id: "U-4",
      name: "بهنام رستمی",
      username: "accounting",
      role: "accounting",
      email: "acc@fasihi.ir",
      active: true,
      lastLogin: iso(-3),
    },
    { id: "U-5", name: "آرش امینی", username: "arash", role: "sales", email: "arash@fasihi.ir", active: false, lastLogin: iso(-40) },
  ];

  const audit: AuditEntry[] = Array.from({ length: 30 }, (_, i) => ({
    id: `AU-${i + 1}`,
    actor: pick(users).name,
    action: pick(["ورود به سامانه", "ثبت پرداخت قسط", "ویرایش نقش کاربر", "خروجی گزارش", "حذف رکورد", "ورود اطلاعات از فایل"]),
    entity: pick(["Customer", "Policy", "Installment", "User", "Report"]),
    ip: `192.168.${Math.floor(rnd() * 5)}.${Math.floor(rnd() * 254)}`,
    date: iso(-Math.floor(rnd() * 20)),
  }));

  const { opportunities, dealActivities } = buildPipelineSeed(iso);

  return {
    customers,
    policies,
    installments,
    tasks,
    notifications,
    activities,
    users,
    audit,
    opportunities,
    dealActivities,
  };
}
