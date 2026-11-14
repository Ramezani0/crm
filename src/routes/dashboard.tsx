import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ShieldCheck, TrendingUp, Users, Wallet } from "lucide-react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { CustomerNameLink, PolicyDossierLink } from "@/components/customer-name-link";
import { Emblem } from "@/components/emblem/Emblem";
import { FieldIconCards } from "@/components/light-3d/field-icon-cards";
import { KpiOrb } from "@/components/light-3d/kpi-orb";
import { LuxOrnament, LuxStill } from "@/components/lux-still";
import { useStore } from "@/lib/store";
import { BRAND, LUX_ART } from "@/lib/brand";
import { fetchHealth, type FetchSource, type HealthCounts } from "@/lib/api";
import { crmPageSubtitle, hasKpiFirstPaint, resolveKpiCounts } from "@/lib/crm-source";
import { dossierCustomerId, policyDisplayNumber } from "@/lib/dossier";
import { FIELD_CARD_KINDS } from "@/lib/light-3d";
import { displayPolicyKind } from "@/lib/map-api-data";
import { overdueDays, remainingAmount } from "@/lib/dossier";
import { compactRial, compareDateStrings, formatDate, formatNumber, relativeDays, toFa } from "@/lib/format";
import { InstallmentBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: `داشبورد | ${BRAND.title}` },
      { name: "description", content: BRAND.subtitle },
      { property: "og:title", content: `داشبورد ${BRAND.title}` },
      { property: "og:description", content: BRAND.tagline },
    ],
  }),
  component: DashboardPage,
});

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  orb,
  orbIndex = 0,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Users;
  orb?: "emerald" | "gold" | "warn";
  orbIndex?: number;
}) {
  return (
    <div className="dashboard-kpi-card rounded-2xl p-4" data-tone={orb ?? "default"}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {orb ? <KpiOrb tone={orb} label={label} index={orbIndex} /> : <Icon className="size-4 text-primary" aria-hidden />}
      </div>
      <p className="mt-3 text-2xl font-extrabold text-title">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function DashboardPage() {
  const {
    customers,
    policies,
    installments,
    today,
    crmSource,
    crmError,
    summaryCounts,
    crmFullReady,
  } = useStore();
  const [health, setHealth] = useState<{ counts: HealthCounts; source: FetchSource } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHealth().then((res) => {
      if (cancelled) return;
      if (res.data.ok) setHealth({ counts: res.data.counts, source: res.source });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const kpiCounts = useMemo(
    () =>
      resolveKpiCounts(
        {
          customers: customers.length,
          policies: policies.length,
          installments: installments.length,
        },
        summaryCounts,
      ),
    [customers.length, policies.length, installments.length, summaryCounts],
  );
  const firstPaint = hasKpiFirstPaint(kpiCounts);
  const summaryOnly = firstPaint && !crmFullReady;
  const fullError = Boolean(crmError);

  const stats = useMemo(() => {
    const overdue: typeof installments = [];
    const upcoming: typeof installments = [];
    let collected = 0;
    let outstanding = 0;

    for (const installment of installments) {
      const remaining = remainingAmount(installment);
      collected += installment.paidAmount;
      outstanding += remaining;

      if (remaining <= 0) continue;
      if (installment.status === "overdue") {
        overdue.push(installment);
        continue;
      }
      if (installment.status === "due") {
        const days = relativeDays(installment.dueDate, today);
        if (Number.isFinite(days) && days <= 14 && days >= 0) upcoming.push(installment);
      }
    }
    upcoming.sort((a, b) => compareDateStrings(a.dueDate, b.dueDate));

    const expiring: typeof policies = [];
    const fieldCounts: Record<string, number> = {};
    let activePolicies = 0;
    for (const kind of FIELD_CARD_KINDS) fieldCounts[kind] = 0;
    for (const policy of policies) {
      if (policy.status === "active") {
        activePolicies += 1;
        const days = relativeDays(policy.endDate, today);
        if (Number.isFinite(days) && days >= 0 && days <= 30) expiring.push(policy);
      }

      const kind = displayPolicyKind(policy.kind || policy.kindRaw);
      const key = FIELD_CARD_KINDS.find((candidate) => kind === candidate) ?? "";
      if (key) fieldCounts[key] = (fieldCounts[key] ?? 0) + 1;
    }
    return { overdue, upcoming, collected, outstanding, expiring, fieldCounts, activePolicies };
  }, [installments, policies, today]);

  const customerNames = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer.fullName])),
    [customers],
  );
  const policiesById = useMemo(
    () => new Map(policies.map((policy) => [policy.id, policy])),
    [policies],
  );
  const customerName = (id: string) => customerNames.get(id);
  const policyOf = (id: string) => policiesById.get(id);
  const policyLabel = (id: string) => {
    const p = policyOf(id);
    return p ? policyDisplayNumber(p) : id;
  };
  const holderId = (customerId: string, policyId: string) =>
    dossierCustomerId({ customerId, policyId, policies });

  const modules = [
    { to: "/customers", label: "مشتریان", hint: "بیمه‌گذاران حقیقی و حقوقی" },
    { to: "/policies", label: "بیمه‌نامه‌ها", hint: "پرتفوی نمایندگی ۳۰۴۵" },
    { to: "/installments", label: "اقساط", hint: "وصول و معوقات" },
    { to: "/renewals", label: "تمدید", hint: "بیمه‌نامه‌های نزدیک انقضا" },
    { to: "/pipeline", label: "پایپلاین", hint: "قیف فروش" },
    { to: "/reports", label: "گزارش‌ها", hint: "خروجی مدیریتی" },
    { to: "/users", label: "کاربران", hint: "نقش‌ها و دسترسی" },
  ] as const;

  return (
    <AppShell
      title="داشبورد مدیریتی"
      subtitle={`${BRAND.subtitle} — ${crmPageSubtitle(crmSource, { fullError, summaryOnly })}`}
      permission="dashboard.view"
    >
      <div className="surface-hero relative overflow-hidden rounded-3xl border border-border/70 p-6">
        <LuxOrnament src={LUX_ART.dashboard} className="opacity-[0.28]" />
        <div className="relative z-[1] flex flex-wrap items-center gap-6">
          <div className="min-w-[240px] flex-1">
            <p className="text-xs font-semibold text-title">{BRAND.subtitleShort}</p>
            <h2 className="mt-2 text-2xl font-extrabold text-title">
              {toFa(formatDate(today.toISOString()))} — وضعیت پرتفوی در یک نگاه
            </h2>
            <p className="mt-2 max-w-xl text-base text-muted-foreground">
              {formatNumber(stats.overdue.length)} قسط معوق و {formatNumber(stats.expiring.length)}{" "}
              بیمه‌نامه در آستانه تمدید نیازمند پیگیری است.
            </p>
            {health && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                قرارداد <span className="num">/api/health</span>
                {health.source === "mock" ? " (نمونهٔ قرارداد — زنده نیست)" : " زنده"}:{" "}
                {formatNumber(health.counts.customers)} مشتری ·{" "}
                {formatNumber(health.counts.policies)} بیمه‌نامه ·{" "}
                {formatNumber(health.counts.installments)} قسط
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild className="rounded-lg font-semibold">
                <Link to="/installments">پیگیری اقساط معوق</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-lg font-semibold">
                <Link to="/renewals">کارتابل تمدید</Link>
              </Button>
            </div>
          </div>
          <Emblem compact className="shrink-0" />
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch">
        <div className="hidden shrink-0 gap-2 xl:flex">
          <LuxStill
            src={LUX_ART.shield}
            alt="سپر نمایندگی"
            className="h-auto w-40 rounded-2xl object-cover ring-1 ring-border/60"
          />
          <LuxStill
            src={LUX_ART.automationShield}
            alt="اتوماسیون نمایندگی"
            className="h-auto w-40 rounded-2xl object-cover ring-1 ring-border/60"
          />
        </div>
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="بیمه‌گذاران"
          value={
            firstPaint || crmFullReady
              ? formatNumber(kpiCounts.customers)
              : crmSource === "pending"
                ? "…"
                : formatNumber(0)
          }
          hint={
            summaryOnly
              ? "شمارش از /api/data/summary"
              : crmFullReady
                ? "شمارش زنده از /api/data"
                : crmSource === "pending"
                  ? "در حال بارگذاری"
                  : crmSource === "error" || fullError
                    ? "بارگذاری ناموفق — دوباره تلاش کنید"
                    : "داده نمایشی — API در دسترس نیست"
          }
          icon={Users}
          orb="emerald"
          orbIndex={0}
        />
        <Kpi
          label={crmFullReady ? "بیمه‌نامه‌های فعال" : "بیمه‌نامه‌ها"}
          value={
            crmFullReady
              ? formatNumber(policies.filter((p) => p.status === "active").length)
              : firstPaint
                ? formatNumber(kpiCounts.policies)
                : crmSource === "pending"
                  ? "…"
                  : formatNumber(0)
          }
          hint={
            crmFullReady
              ? `از مجموع ${formatNumber(policies.length)} بیمه‌نامه`
              : summaryOnly
                ? `مجموع ${formatNumber(kpiCounts.policies)} از /api/data/summary`
                : crmSource === "pending"
                  ? "در حال بارگذاری"
                  : "جزئیات پس از بارگذاری کامل"
          }
          icon={ShieldCheck}
          orb="gold"
          orbIndex={1}
        />
        <Kpi
          label={crmFullReady ? "وصول‌شده" : "اقساط"}
          value={
            crmFullReady
              ? `${compactRial(stats.collected)} ریال`
              : firstPaint
                ? formatNumber(kpiCounts.installments)
                : crmSource === "pending"
                  ? "…"
                  : formatNumber(0)
          }
          hint={
            crmFullReady
              ? "مجموع پرداخت‌های ثبت‌شده"
              : summaryOnly
                ? `مجموع ${formatNumber(kpiCounts.installments)} قسط از summary`
                : "مجموع پرداخت‌های ثبت‌شده"
          }
          icon={Wallet}
          orb="emerald"
          orbIndex={2}
        />
        <Kpi
          label="مانده مطالبات"
          value={crmFullReady ? `${compactRial(stats.outstanding)} ریال` : "…"}
          hint={
            crmFullReady
              ? `${formatNumber(stats.overdue.length)} قسط معوق`
              : summaryOnly
                ? "پس از بارگذاری کامل /api/data"
                : `${formatNumber(stats.overdue.length)} قسط معوق`
          }
          icon={TrendingUp}
          orb="warn"
          orbIndex={3}
        />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => (
          <Link
            key={m.to}
            to={m.to}
            className="glass rounded-2xl p-4 transition-colors hover:border-primary/40"
          >
            <p className="font-bold">{m.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{m.hint}</p>
          </Link>
        ))}
      </div>

      <SectionCard title="رشته‌های بیمه‌ای" description="کارت سه‌بعدی سبک — بدون Three.js روی جدول">
        <FieldIconCards
          counts={stats.fieldCounts}
          installmentCount={crmFullReady ? installments.length : kpiCounts.installments}
        />
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="اقساط نزدیک سررسید" description="۱۴ روز آینده">
          <ul className="space-y-2">
            {stats.upcoming.slice(0, 5).map((i) => {
              const cid = holderId(i.customerId, i.policyId);
              return (
                <li
                  key={i.id}
                  className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <CalendarClock className="size-4 text-info" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <CustomerNameLink
                        customerId={cid}
                        name={customerName(i.customerId) ?? customerName(cid ?? "")}
                      />
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      <PolicyDossierLink customerId={cid} label={policyLabel(i.policyId)} policyId={i.policyId} />{" "}
                      · سررسید {formatDate(i.dueDate)}
                    </p>
                  </div>
                  <span className="num text-xs font-semibold">{formatNumber(i.amount)}</span>
                </li>
              );
            })}
          </ul>
        </SectionCard>
        <SectionCard title="اقساط معوق" description="نیازمند پیگیری فوری">
          <ul className="space-y-2">
            {stats.overdue.slice(0, 5).map((i) => {
              const cid = holderId(i.customerId, i.policyId);
              return (
                <li
                  key={i.id}
                  className="flex items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm"
                >
                  <AlertTriangle className="size-4 text-destructive" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <CustomerNameLink
                        customerId={cid}
                        name={customerName(i.customerId) ?? customerName(cid ?? "")}
                      />
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      <PolicyDossierLink customerId={cid} label={policyLabel(i.policyId)} policyId={i.policyId} />{" "}
                      ·{" "}
                      {Number.isFinite(overdueDays(i, today))
                        ? `${toFa(overdueDays(i, today))} روز معوق`
                        : "بدون سررسید معتبر"}
                    </p>
                  </div>
                  <InstallmentBadge status={i.status} />
                </li>
              );
            })}
          </ul>
        </SectionCard>
        <SectionCard title="تمدید نزدیک" description="۳۰ روز آینده — نام و شماره به پرونده ۳۶۵">
          <ul className="space-y-2">
            {stats.expiring.slice(0, 5).map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <CalendarClock className="size-4 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <CustomerNameLink customerId={p.customerId} name={customerName(p.customerId)} />
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    <PolicyDossierLink
                      customerId={p.customerId}
                      label={policyDisplayNumber(p)}
                      policyId={p.id}
                    />{" "}
                    · پایان {formatDate(p.endDate)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </AppShell>
  );
}
