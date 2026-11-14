import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Hospital, RefreshCw } from "lucide-react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";
import { formatNumber, toFa } from "@/lib/format";
import {
  DEMO_DISCLAIMER,
  PRODUCT_LABEL,
  categoryLabel,
  fetchGhCeiling,
  fetchGhClaims,
  fetchGhContracts,
  fetchGhMembers,
  fetchGhReferrals,
  fetchGhTariff,
  fetchGhWaiting,
  issueGhReferral,
  postPersonnelAmendment,
  registerGhClaim,
  type GhClaim,
  type GhContract,
  type GhMember,
  type GhReferral,
  type GhTariff,
} from "@/lib/group-health";

export const Route = createFileRoute("/group-health")({
  head: () => ({
    meta: [
      { title: `${PRODUCT_LABEL} | ${BRAND.title}` },
      {
        name: "description",
        content: "درمان گروهی — معرفی‌نامه الکترونیکی، سقف مانده، خسارت سرپایی/دندان، انتظار، الحاقیه پرسنل.",
      },
    ],
  }),
  component: GroupHealthPage,
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

function GroupHealthPage() {
  const [contracts, setContracts] = useState<GhContract[]>([]);
  const [members, setMembers] = useState<GhMember[]>([]);
  const [referrals, setReferrals] = useState<GhReferral[]>([]);
  const [claims, setClaims] = useState<GhClaim[]>([]);
  const [tariffs, setTariffs] = useState<GhTariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [memberId, setMemberId] = useState("1");
  const [refType, setRefType] = useState<"hospital" | "paraclinic">("paraclinic");
  const [refCode, setRefCode] = useState("GH-P-210");
  const [ceilingPreview, setCeilingPreview] = useState<{
    remainingRial: number;
    franchisePct: number;
    category: string;
  } | null>(null);
  const [waitingBanner, setWaitingBanner] = useState<string | null>(null);

  const [claimKind, setClaimKind] = useState<"outpatient" | "dental">("dental");
  const [claimAmount, setClaimAmount] = useState("2000000");
  const [claimCode, setClaimCode] = useState("GH-D-310");

  const [csvStub, setCsvStub] = useState(
    "action,memberCode,fullName,nationalId\nadd,M-UI-1,عضو الحاقیه,999\n",
  );
  const [asOfJalali, setAsOfJalali] = useState("1404/07/01");

  const activeContract = contracts[0] || null;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [c, m, r, cl, t] = await Promise.all([
      fetchGhContracts(),
      fetchGhMembers(),
      fetchGhReferrals(),
      fetchGhClaims(),
      fetchGhTariff(),
    ]);
    if (c.ok) setContracts(c.items);
    else setError(("error" in c && c.error) || "API درمان گروهی در دسترس نیست.");
    if (m.ok) {
      setMembers(m.items);
      if (m.items.length && !memberId) setMemberId(String(m.items[0].id));
    }
    if (r.ok) setReferrals(r.items);
    if (cl.ok) setClaims(cl.items);
    if (t.ok) setTariffs(t.items);
    setLoading(false);
  }, [memberId]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshPreview = useCallback(async () => {
    const mid = Number(memberId);
    if (!Number.isFinite(mid)) return;
    const cat = refType;
    const [ceil, wait] = await Promise.all([
      fetchGhCeiling(mid, cat),
      fetchGhWaiting(mid, cat === "hospital" ? "surgery" : "maternity"),
    ]);
    if (ceil.ok && ceil.remainingRial != null && ceil.franchisePct != null) {
      setCeilingPreview({
        remainingRial: ceil.remainingRial,
        franchisePct: ceil.franchisePct,
        category: cat,
      });
    } else {
      setCeilingPreview(null);
    }
    if (wait.ok && wait.blocked) {
      setWaitingBanner(
        `دوره انتظار ${categoryLabel(wait.benefit || "")} فعال — ${toFa(String(wait.remainingWaitDays ?? 0))} روز مانده (عضو: ${wait.memberName || mid})`,
      );
    } else {
      setWaitingBanner(null);
    }
  }, [memberId, refType]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview]);

  const activeMembers = useMemo(
    () => members.filter((m) => m.status === "active"),
    [members],
  );

  async function onIssueReferral() {
    setBusy(true);
    setMsg(null);
    const r = await issueGhReferral({
      memberId: Number(memberId),
      type: refType,
      serviceCode: refCode || undefined,
    });
    setBusy(false);
    if (r.ok) {
      setMsg(
        `معرفی‌نامه #${r.referral?.id} صادر شد — سقف مانده ${formatNumber(r.preview?.ceilingRemainingRial || 0)} · فرانشیز ${toFa(String(r.preview?.franchisePct ?? 0))}٪`,
      );
      void reload();
    } else {
      setMsg(r.error || "خطا در صدور معرفی‌نامه");
    }
  }

  async function onRegisterClaim() {
    setBusy(true);
    setMsg(null);
    const r = await registerGhClaim({
      memberId: Number(memberId),
      kind: claimKind,
      amount: Number(claimAmount),
      serviceCode: claimCode || undefined,
    });
    setBusy(false);
    if (r.ok && r.claim) {
      setMsg(
        `خسارت #${r.claim.id} — پرداخت پیشنهادی ${formatNumber(r.claim.payoutRial)} (فرانشیز ${formatNumber(r.claim.franchiseRial)})`,
      );
      void reload();
    } else {
      setMsg(r.error || "خطا در ثبت خسارت");
    }
  }

  async function onAmendment() {
    if (!activeContract) return;
    setBusy(true);
    setMsg(null);
    const r = await postPersonnelAmendment({
      contractId: activeContract.id,
      asOfJalali,
      csv: csvStub,
    });
    setBusy(false);
    if (r.ok && r.amendment) {
      setMsg(
        `الحاقیه ثبت شد — اضافه ${toFa(String(r.amendment.addsCount))} · حذف ${toFa(String(r.amendment.removesCount))} · بدون wipe CRM`,
      );
      void reload();
    } else {
      setMsg(r.error || "خطا در الحاقیه");
    }
  }

  return (
    <AppShell title={PRODUCT_LABEL} subtitle="معرفی‌نامه · سقف مانده · خسارت سرپایی · انتظار · الحاقیه پرسنل">
      <div className="space-y-4" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-title">
            <Hospital className="size-5 text-primary" />
            <h1 className="text-xl font-extrabold">{PRODUCT_LABEL}</h1>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
              DEMO
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className="size-4 ms-1" />
            بروزرسانی
          </Button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">{DEMO_DISCLAIMER}</p>
        <p className="text-[11px] text-muted-foreground">
          Eng-extension: <span className="num">product_code=group_health</span> — خارج از enum قفل‌شدهٔ Import تا به‌روزرسانی map.
          · بدون اکسل درمان در n1–n21.
        </p>

        {waitingBanner && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            ⏳ {waitingBanner}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">{error}</div>
        )}
        {msg && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">{msg}</div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FlatKpi
            label="قراردادها"
            value={toFa(String(contracts.length))}
            hint={activeContract?.employerName || "—"}
          />
          <FlatKpi label="اعضای فعال" value={toFa(String(activeMembers.length))} hint="پرسنل تحت پوشش" />
          <FlatKpi label="معرفی‌نامه‌ها" value={toFa(String(referrals.length))} hint="E-Referral" />
          <FlatKpi label="خسارت‌ها" value={toFa(String(claims.length))} hint="کارتابل سرپایی/دندان" />
        </div>

        <SectionCard title="صدور معرفی‌نامه (E-Referral)" subtitle="استعلام فرانشیز و سقف مانده قبل از صدور">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>عضو</Label>
              <select className={FIELD} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} ({m.memberCode})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>نوع</Label>
              <select
                className={FIELD}
                value={refType}
                onChange={(e) => setRefType(e.target.value as "hospital" | "paraclinic")}
              >
                <option value="hospital">بیمارستانی</option>
                <option value="paraclinic">پاراکلینیک</option>
              </select>
            </div>
            <div>
              <Label>کد خدمت (اختیاری)</Label>
              <Input className={FIELD} value={refCode} onChange={(e) => setRefCode(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={() => void onIssueReferral()} disabled={busy}>
                صدور معرفی‌نامه
              </Button>
            </div>
          </div>
          {ceilingPreview && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3 text-sm">
              <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2">
                <span className="text-muted-foreground">سقف مانده تعهد</span>
                <p className="font-bold num">{formatNumber(ceilingPreview.remainingRial)} ریال</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2">
                <span className="text-muted-foreground">فرانشیز</span>
                <p className="font-bold">{toFa(String(ceilingPreview.franchisePct))}٪</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2">
                <span className="text-muted-foreground">دسته</span>
                <p className="font-bold">{categoryLabel(ceilingPreview.category)}</p>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="کارتابل خسارت سرپایی / دندان" subtitle="تطبیق تعرفه stub · کسر فرانشیز · پیش‌نمایش دستور پرداخت">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label>نوع</Label>
              <select
                className={FIELD}
                value={claimKind}
                onChange={(e) => setClaimKind(e.target.value as "outpatient" | "dental")}
              >
                <option value="outpatient">سرپایی</option>
                <option value="dental">دندان‌پزشکی</option>
              </select>
            </div>
            <div>
              <Label>مبلغ فاکتور (ریال)</Label>
              <Input
                className={`${FIELD} num`}
                value={claimAmount}
                onChange={(e) => setClaimAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>کد تعرفه</Label>
              <Input className={FIELD} value={claimCode} onChange={(e) => setClaimCode(e.target.value)} />
            </div>
            <div>
              <Label>عضو</Label>
              <select className={FIELD} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={() => void onRegisterClaim()} disabled={busy}>
                ثبت و پیش‌نمایش
              </Button>
            </div>
          </div>
          {claims.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="py-2 text-right">#</th>
                    <th className="py-2 text-right">عضو</th>
                    <th className="py-2 text-right">نوع</th>
                    <th className="py-2 text-right">تعرفه</th>
                    <th className="py-2 text-right">فرانشیز</th>
                    <th className="py-2 text-right">پرداخت</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.slice(0, 8).map((c) => (
                    <tr key={c.id} className="border-b border-border/40">
                      <td className="py-2 num">{c.id}</td>
                      <td className="py-2">{c.memberName}</td>
                      <td className="py-2">{c.kind}</td>
                      <td className="py-2 num">{formatNumber(c.approvedTariffRial)}</td>
                      <td className="py-2 num">{formatNumber(c.franchiseRial)}</td>
                      <td className="py-2 font-bold num">{formatNumber(c.payoutRial)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="الحاقیه لیست پرسنل (stub)"
          subtitle="CSV/JSON — بدون wipe مشتریان CRM · Excel HOLD"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>CSV نمونه</Label>
              <textarea
                className="min-h-[100px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm font-mono"
                value={csvStub}
                onChange={(e) => setCsvStub(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-3">
              <div>
                <Label>از تاریخ (جلالی)</Label>
                <Input
                  className={FIELD}
                  value={asOfJalali}
                  onChange={(e) => setAsOfJalali(e.target.value)}
                  dir="ltr"
                />
              </div>
              <Button className="w-full" onClick={() => void onAmendment()} disabled={busy || !activeContract}>
                ثبت الحاقیه stub
              </Button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="تعرفه DEMO (کالیفرنیا / ارزش نسبی)" subtitle="چند کد نمونه — جایگزین قبل از تولید">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="py-2 text-right">کد</th>
                  <th className="py-2 text-right">عنوان</th>
                  <th className="py-2 text-right">دسته</th>
                  <th className="py-2 text-right">تعرفه مصوب</th>
                  <th className="py-2 text-right">ارزش نسبی</th>
                </tr>
              </thead>
              <tbody>
                {tariffs.map((t) => (
                  <tr key={t.serviceCode} className="border-b border-border/40">
                    <td className="py-2 num font-mono text-xs">{t.serviceCode}</td>
                    <td className="py-2">{t.titleFa}</td>
                    <td className="py-2">{categoryLabel(t.category)}</td>
                    <td className="py-2 num">{formatNumber(t.approvedRial)}</td>
                    <td className="py-2 num">{t.relativeValue ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="معرفی‌نامه‌های اخیر" subtitle="">
          {referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground">هنوز معرفی‌نامه‌ای صادر نشده.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {referrals.slice(0, 10).map((r) => (
                <li key={r.id} className="rounded-lg border border-border/50 px-3 py-2 flex flex-wrap gap-3 justify-between">
                  <span>
                    #{r.id} · {r.memberName} · {categoryLabel(r.type)}
                    {r.serviceCode ? ` · ${r.serviceCode}` : ""}
                  </span>
                  <span className="text-muted-foreground num">
                    سقف {formatNumber(r.ceilingRemainingRial)} · فرانشیز {toFa(String(r.franchisePct))}٪
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <p className="text-[11px] text-muted-foreground">
          مسیر منو: سایر ← درمان گروهی · API: <span className="num">/api/group-health/*</span>
          {" · "}
          product_code=<span className="num">group_health</span>
        </p>
      </div>
    </AppShell>
  );
}
