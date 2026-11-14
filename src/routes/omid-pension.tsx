import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, HeartPulse, RefreshCw } from "lucide-react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";
import { formatNumber, toFa } from "@/lib/format";
import {
  DEMO_DISCLAIMER,
  GUARANTEED_YEARS,
  PRODUCT_LABEL,
  RETIREMENT_AGE_MAX,
  RETIREMENT_AGE_MIN,
  compoundMonthly,
  createOmidPlan,
  demoInitialMonthly,
  fetchOmidPlans,
  fetchOmidSchedule,
  fetchProofOfLife,
  getTeamshoUrl,
  postProofOfLife,
  simulateOmid,
  transitionOmid,
  validateRetirementAge,
  type OmidPlan,
} from "@/lib/omid-pension";

export const Route = createFileRoute("/omid-pension")({
  head: () => ({
    meta: [
      { title: `${PRODUCT_LABEL} | ${BRAND.title}` },
      {
        name: "description",
        content: "امید بازنشستگی — شبیه‌ساز مستمری ۱۰٪ مرکب، فاز تضمینی/مادام‌العمر، گواهی حیات.",
      },
    ],
  }),
  component: OmidPensionPage,
});

const FIELD =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FlatKpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="glass rounded-2xl border border-border/60 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-extrabold text-title">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function phaseLabel(phase: string): string {
  if (phase === "accumulation") return "انباشت";
  if (phase === "guaranteed_10y") return "تضمینی ۱۰ساله";
  if (phase === "lifetime") return "مادام‌العمر";
  return phase;
}

function OmidPensionPage() {
  const [plans, setPlans] = useState<OmidPlan[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<Array<Record<string, unknown>>>([]);
  const [polStatus, setPolStatus] = useState<string>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [age, setAge] = useState("55");
  const [accYears, setAccYears] = useState("15");
  const [accRial, setAccRial] = useState(String(240_000_000));
  const [simResult, setSimResult] = useState<{
    initialMonthlyRial: number;
    yearsPreview: Array<{ yearIndex: number; monthlyRial: number; phase: string }>;
  } | null>(null);

  const teamshoUrl = useMemo(() => getTeamshoUrl(), []);

  const openTeamsho = () => {
    window.open(teamshoUrl, "_blank", "noopener,noreferrer");
  };

    const selected = useMemo(
    () => plans.find((p) => p.id === selectedId) || null,
    [plans, selectedId],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const p = await fetchOmidPlans();
    if (p.ok) {
      setPlans(p.items);
      if (p.items.length && selectedId == null) setSelectedId(p.items[0].id);
    } else {
      setError(("error" in p && p.error) || "API امید بازنشستگی در دسترس نیست — حالت محلی.");
    }
    setLoading(false);
  }, [selectedId]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId == null) return;
    void (async () => {
      const [s, pol] = await Promise.all([
        fetchOmidSchedule(selectedId),
        fetchProofOfLife(selectedId),
      ]);
      if (s.ok) setSchedule(s.items.slice(0, 24));
      if (pol.ok) setPolStatus(pol.status);
    })();
  }, [selectedId]);

  const localInitial = useMemo(() => {
    const a = Number(age);
    const y = Number(accYears);
    const r = Number(accRial);
    if (!validateRetirementAge(a).ok || !Number.isFinite(y) || !Number.isFinite(r)) return null;
    return demoInitialMonthly(r, y);
  }, [age, accYears, accRial]);

  const onSimulate = async () => {
    const a = Number(age);
    const v = validateRetirementAge(a);
    if (!v.ok) {
      setMsg(v.error || "سن نامعتبر");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await simulateOmid({
        retirementAge: a,
        accumulationYears: Number(accYears) || 10,
        accumulationRial: Number(accRial) || undefined,
      });
      if (res.ok && res.initialMonthlyRial != null && res.yearsPreview) {
        setSimResult({
          initialMonthlyRial: res.initialMonthlyRial,
          yearsPreview: res.yearsPreview.slice(0, 12),
        });
        setMsg("شبیه‌سازی DEMO انجام شد");
      } else {
        // local fallback
        const init = localInitial ?? 0;
        setSimResult({
          initialMonthlyRial: init,
          yearsPreview: Array.from({ length: 12 }, (_, n) => ({
            yearIndex: n,
            monthlyRial: compoundMonthly(init, n),
            phase: n < GUARANTEED_YEARS ? "guaranteed_10y" : "lifetime",
          })),
        });
        setMsg(res.error || "API نبود — پیش‌نمایش محلی DEMO");
      }
    } catch {
      setMsg("خطا در شبیه‌سازی");
    }
    setBusy(false);
  };

  const onCreate = async () => {
    const a = Number(age);
    if (!validateRetirementAge(a).ok) {
      setMsg("سن خارج از ۵۰–۶۱");
      return;
    }
    setBusy(true);
    try {
      const res = await createOmidPlan({
        retirementAge: a,
        accumulationYears: Number(accYears) || 10,
        accumulationRial: Number(accRial) || 240_000_000,
        policyNumber: `OMID-UI-${Date.now()}`,
        nationalId: "0000000000",
        life_policy_meta: {
          first_year_end_reserve: Number(accRial) || 240_000_000,
          premium_escalate_pct: 10,
          sum_insured_escalate_pct: 10,
        },
      });
      if (res.ok && res.plan) {
        setMsg(`طرح #${res.plan.id} ساخته شد (انباشت)`);
        await reload();
        setSelectedId(res.plan.id);
      } else setMsg(res.error || "خطا");
    } catch {
      setMsg("API در دسترس نیست");
    }
    setBusy(false);
  };

  const onTransition = async () => {
    if (selectedId == null) return;
    setBusy(true);
    try {
      const res = await transitionOmid(selectedId);
      if (res.ok) {
        setMsg(`انتقال به تضمینی — ${toFa(res.scheduleCount ?? 0)} قسط زمان‌بندی`);
        await reload();
        const s = await fetchOmidSchedule(selectedId);
        if (s.ok) setSchedule(s.items.slice(0, 24));
      } else setMsg(res.error || "خطا");
    } catch {
      setMsg("API در دسترس نیست");
    }
    setBusy(false);
  };

  const onConfirmPol = async () => {
    if (selectedId == null) return;
    setBusy(true);
    try {
      const res = await postProofOfLife(selectedId, "confirmed");
      if (res.ok) {
        setPolStatus(res.status || "confirmed");
        setMsg("گواهی حیات تأیید شد (stub)");
      } else setMsg(res.error || "خطا");
    } catch {
      setMsg("API در دسترس نیست");
    }
    setBusy(false);
  };

  return (
    <AppShell
      title={PRODUCT_LABEL}
      subtitle="مستمری امید — اسکلت M3 · ۱۰٪ مرکب DEMO · گواهی حیات stub · Excel HOLD"
      permission="tools.view"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-200">
          DEMO محلی
        </span>
        <span className="inline-flex items-center rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-xs font-bold text-sky-800 dark:text-sky-200">
          منبع خارجی تیمشو
        </span>
      </div>

      <div
        role="status"
        className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
      >
        <p className="font-bold text-amber-800 dark:text-amber-200">DEMO محلی — اسکلت CRM</p>
        <p className="mt-1 text-xs text-muted-foreground">{DEMO_DISCLAIMER}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          جدول زنده بیمه‌نامه در CRM نیست (iframe مسدود · API عمومی نیست). برای شبیه‌ساز رسمی
          کارآفرین از دکمه تیمشو استفاده کنید — تب جدید، بدون فرض ورود اجباری.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={openTeamsho} className="gap-2">
          <ExternalLink className="size-4" aria-hidden />
          باز کردن تیم‌شو
        </Button>
        <a
          href={teamshoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-sky-700 underline underline-offset-2 dark:text-sky-300"
        >
          {teamshoUrl}
        </a>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="mb-3 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm">{msg}</p>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FlatKpi
          label="محدوده سن"
          value={`${toFa(RETIREMENT_AGE_MIN)}–${toFa(RETIREMENT_AGE_MAX)}`}
          hint="بازنشستگی"
        />
        <FlatKpi label="تعدیل مرکب" value="٪۱۰" hint="Monthly × (1.10)^N" />
        <FlatKpi label="تضمینی" value={`${toFa(GUARANTEED_YEARS)} سال`} hint="سپس مادام‌العمر" />
        <FlatKpi
          label="طرح‌ها"
          value={toFa(plans.length)}
          hint={selected ? phaseLabel(selected.phase) : "—"}
        />
      </div>

      {selected ? (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            selected.phase === "accumulation"
              ? "border-border/60 bg-card"
              : "border-emerald-500/40 bg-emerald-500/10"
          }`}
        >
          <p className="font-bold">
            فاز فعلی: {phaseLabel(selected.phase)}
            {selected.loanBlocked || selected.surrenderBlocked
              ? " · وام/بازخرید قفل"
              : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground num">
            policy={selected.policyNumber || "—"} · NID={selected.nationalId || "—"} · type=
            {selected.insuranceType}
            {selected.issueDateJalali ? ` · صدور ${selected.issueDateJalali}` : ""}
          </p>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
          <RefreshCw className="size-3.5" />
          بروزرسانی
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="شبیه‌ساز مستمری (DEMO محلی)"
          description="سن ۵۰–۶۱ · سال انباشت · اندوخته · خروجی CRM نه تیمشو"
        >
          <div className="space-y-3">
            <div>
              <Label htmlFor="op-age">سن بازنشستگی</Label>
              <Input
                id="op-age"
                className={`${FIELD} num`}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div>
              <Label htmlFor="op-years">سال‌های انباشت</Label>
              <Input
                id="op-years"
                className={`${FIELD} num`}
                value={accYears}
                onChange={(e) => setAccYears(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div>
              <Label htmlFor="op-acc">اندوخته (ریال) — DEMO / first_year_end_reserve</Label>
              <Input
                id="op-acc"
                className={`${FIELD} num`}
                value={accRial}
                onChange={(e) => setAccRial(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void onSimulate()} disabled={busy}>
                شبیه‌سازی
              </Button>
              <Button type="button" variant="secondary" onClick={() => void onCreate()} disabled={busy}>
                ایجاد طرح انباشت
              </Button>
              <Button type="button" variant="outline" onClick={openTeamsho} className="gap-1.5">
                <ExternalLink className="size-3.5" aria-hidden />
                باز کردن تیم‌شو
              </Button>
            </div>
            {simResult ? (
              <div className="rounded-lg border border-border/50 p-3 text-sm">
                <p>
                  مستمری اولیه DEMO:{" "}
                  <span className="num font-bold">
                    {toFa(formatNumber(simResult.initialMonthlyRial))}
                  </span>{" "}
                  ریال/ماه
                </p>
                <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
                  {simResult.yearsPreview.map((y) => (
                    <li key={y.yearIndex} className="num">
                      Y{y.yearIndex}: {toFa(formatNumber(y.monthlyRial))} · {phaseLabel(y.phase)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : localInitial != null ? (
              <p className="text-xs text-muted-foreground">
                پیش‌نمایش محلی:{" "}
                <span className="num">{toFa(formatNumber(localInitial))}</span> ریال/ماه
              </p>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="گواهی حیات (stub)" description="SMS/ثبت‌احوال — TODO later">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <HeartPulse className="size-5 text-muted-foreground" aria-hidden />
              <span>
                وضعیت: <strong>{polStatus}</strong>
                {polStatus !== "confirmed" ? " · پیشروی پرداخت مسدود" : ""}
              </span>
            </div>
            <Button type="button" onClick={() => void onConfirmPol()} disabled={busy || selectedId == null}>
              تأیید PoL (stub)
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onTransition()}
              disabled={busy || selectedId == null || selected?.phase !== "accumulation"}
            >
              انتقال به فاز تضمینی
            </Button>
            <p className="text-[11px] text-muted-foreground">
              در فاز مستمری وام و بازخرید قفل می‌شود. Eng owns compound/PoL/lock — Import فقط
              meta/n5 را می‌نشاند.
            </p>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="پیش‌نمایش زمان‌بندی (۲۴ ماه اول)"
        description="DEMO محلی · ۱۰٪ مرکب سالانه · Eng-owned — زنده تیمشو نیست"
        className="mt-4"
      >
        {schedule.length === 0 ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              هنوز جدول محلی نیست — پس از «انتقال به فاز تضمینی» ردیف‌های DEMO اینجا می‌آیند.
            </p>
            <p>
              برای جدول / شبیه‌ساز رسمی کارآفرین، شبیه‌ساز تیمشو را در تب جدید باز کنید (منبع خارجی؛
              ورود اجباری فرض نشده).
            </p>
            <Button type="button" variant="outline" size="sm" onClick={openTeamsho} className="gap-1.5">
              <ExternalLink className="size-3.5" aria-hidden />
              باز کردن تیم‌شو
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-2 py-1 text-right font-medium">ماه</th>
                  <th className="px-2 py-1 text-right font-medium">سال</th>
                  <th className="px-2 py-1 text-right font-medium">مبلغ</th>
                  <th className="px-2 py-1 text-right font-medium">وضعیت</th>
                  <th className="px-2 py-1 text-right font-medium">پرداخت‌شونده</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((row) => (
                  <tr key={String(row.id)} className="border-b border-border/40">
                    <td className="num px-2 py-1">{toFa(Number(row.monthIndex))}</td>
                    <td className="num px-2 py-1">{toFa(Number(row.yearIndex))}</td>
                    <td className="num px-2 py-1">{toFa(formatNumber(Number(row.amountRial)))}</td>
                    <td className="px-2 py-1">{String(row.status)}</td>
                    <td className="px-2 py-1">{String(row.payee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="فهرست طرح‌ها" description="لینک policy_number + national_id" className="mt-4">
        <ul className="space-y-2 text-sm">
          {plans.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`w-full rounded-lg border px-3 py-2 text-right ${
                  p.id === selectedId ? "border-primary bg-primary/5" : "border-border/50"
                }`}
                onClick={() => setSelectedId(p.id)}
              >
                <span className="font-medium">#{toFa(p.id)}</span> · {phaseLabel(p.phase)} ·{" "}
                <span className="num">{p.policyNumber || "—"}</span>
              </button>
            </li>
          ))}
          {plans.length === 0 ? (
            <li className="text-muted-foreground">طرحی نیست</li>
          ) : null}
        </ul>
      </SectionCard>
    </AppShell>
  );
}
