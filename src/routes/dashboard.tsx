import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useMemo } from "react";
import { AlertTriangle, ArrowLeft, CalendarClock, ShieldCheck, TrendingUp, Users, Wallet } from "lucide-react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { Emblem } from "@/components/emblem/Emblem";
import { useStore } from "@/lib/store";
import { compactRial, formatDate, formatNumber, relativeDays, toFa } from "@/lib/format";
import { InstallmentBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";

const DashboardCharts = lazy(() => import("@/components/dashboard-charts"));
const PipelineFunnelChart = lazy(() => import("@/components/pipeline-funnel-chart"));

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "داشبورد مدیریتی | CRM فصیحی" },
      { name: "description", content: "شاخص‌های کلیدی، اقساط سررسید و معوق، فعالیت‌ها و هشدارهای دفتر بیمه فصیحی." },
      { property: "og:title", content: "داشبورد مدیریتی CRM فصیحی" },
      { property: "og:description", content: "نمای کلی عملکرد فروش، وصول اقساط و وضعیت بیمه‌نامه‌ها." },
    ],
  }),
  component: DashboardPage,
});

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Users;
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="size-4 text-primary" aria-hidden />
      </div>
      <p className="mt-3 text-2xl font-extrabold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function DashboardPage() {
  const { customers, policies, installments, activities, notifications, today } = useStore();

  const stats = useMemo(() => {
    const overdue = installments.filter((i) => i.status === "overdue");
    const upcoming = installments
      .filter((i) => i.status === "due" && relativeDays(i.dueDate, today) <= 14 && relativeDays(i.dueDate, today) >= 0)
      .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));
    const collected = installments.reduce((s, i) => s + i.paidAmount, 0);
    const outstanding = installments.reduce((s, i) => s + (i.amount - i.paidAmount), 0);
    const expiring = policies.filter(
      (p) => p.status === "active" && relativeDays(p.endDate, today) >= 0 && relativeDays(p.endDate, today) <= 30,
    );
    return { overdue, upcoming, collected, outstanding, expiring };
  }, [installments, policies, today]);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.fullName ?? "—";

  return (
    <AppShell title="داشبورد مدیریتی" subtitle="نمای کلی عملکرد دفتر بیمه فصیحی" permission="dashboard.view">
      <div className="surface-hero relative overflow-hidden rounded-3xl border border-border/70 p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="min-w-[240px] flex-1">
            <p className="text-xs font-semibold text-primary">نمای کلی امروز</p>
            <h2 className="mt-2 text-2xl font-extrabold leading-relaxed">
              {toFa(formatDate(today.toISOString()))} — وضعیت پرتفوی در یک نگاه
            </h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {formatNumber(stats.overdue.length)} قسط معوق و {formatNumber(stats.expiring.length)} بیمه‌نامه در
              آستانه انقضا نیازمند پیگیری است.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/installments"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                پیگیری اقساط معوق
              </Link>
              <Link to="/reports" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
                گزارش‌های مدیریتی
              </Link>
            </div>
          </div>
          <Emblem className="w-56 shrink-0" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="بیمه‌گذاران" value={formatNumber(customers.length)} hint="کل مشتریان ثبت‌شده" icon={Users} />
        <Kpi
          label="بیمه‌نامه‌های فعال"
          value={formatNumber(policies.filter((p) => p.status === "active").length)}
          hint={`از مجموع ${formatNumber(policies.length)} بیمه‌نامه`}
          icon={ShieldCheck}
        />
        <Kpi label="وصول‌شده" value={`${compactRial(stats.collected)} ریال`} hint="مجموع پرداخت‌های ثبت‌شده" icon={Wallet} />
        <Kpi
          label="مانده مطالبات"
          value={`${compactRial(stats.outstanding)} ریال`}
          hint={`${formatNumber(stats.overdue.length)} قسط معوق`}
          icon={TrendingUp}
        />
      </div>

      <SectionCard
        title="قیف فروش"
        description="فرصت‌های باز به تفکیک مرحله"
        actions={
          <Link to="/pipeline" className="flex items-center gap-1 text-xs text-primary">
            مدیریت قیف <ArrowLeft className="size-3" aria-hidden />
          </Link>
        }
      >
        <Suspense fallback={<Skeleton className="h-[230px] w-full rounded-xl" />}>
          <PipelineFunnelChart />
        </Suspense>
      </SectionCard>

      <Suspense fallback={<Skeleton className="h-[320px] w-full rounded-2xl" />}>
        <DashboardCharts />
      </Suspense>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="اقساط نزدیک سررسید"
          description="۱۴ روز آینده"
          actions={
            <Link to="/installments" className="flex items-center gap-1 text-xs text-primary">
              همه <ArrowLeft className="size-3" aria-hidden />
            </Link>
          }
        >
          <ul className="space-y-2">
            {stats.upcoming.slice(0, 6).map((i) => (
              <li key={i.id} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
                <CalendarClock className="size-4 text-info" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{customerName(i.customerId)}</p>
                  <p className="text-[11px] text-muted-foreground">سررسید {formatDate(i.dueDate)}</p>
                </div>
                <span className="num text-xs font-semibold">{formatNumber(i.amount)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="اقساط معوق" description="نیازمند پیگیری فوری">
          <ul className="space-y-2">
            {stats.overdue.slice(0, 6).map((i) => (
              <li key={i.id} className="flex items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm">
                <AlertTriangle className="size-4 text-destructive" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{customerName(i.customerId)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {toFa(Math.abs(relativeDays(i.dueDate, today)))} روز تأخیر
                  </p>
                </div>
                <InstallmentBadge status={i.status} statusLabel={i.statusLabel} />
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="آخرین فعالیت‌ها و هشدارها">
          <ul className="space-y-2">
            {notifications.slice(0, 3).map((n) => (
              <li key={n.id} className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-sm">
                <p className="font-medium">{n.title}</p>
                <p className="text-[11px] text-muted-foreground">{formatDate(n.date)}</p>
              </li>
            ))}
            {activities.slice(0, 5).map((a) => (
              <li key={a.id} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
                <p>
                  <span className="font-semibold">{a.actor}</span> — {a.action} برای {a.target}
                </p>
                <p className="text-[11px] text-muted-foreground">{formatDate(a.date)}</p>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </AppShell>
  );
}
