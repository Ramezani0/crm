import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Gift, RefreshCw, Store } from "lucide-react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";
import { toFa } from "@/lib/format";
import {
  DEMO_DISCLAIMER,
  DEMO_RATES,
  DEFAULT_SEASON,
  EARN_REASONS,
  LOCKED_TRIGGER_TYPES,
  MODULE_LABEL,
  SHOP_IFRAME_ALLOWED,
  SHOP_IFRAME_BLOCK_REASON,
  SHOP_LABEL,
  SHOP_OPEN_HINT,
  SHOP_OPEN_LABEL,
  SHOP_URL,
  earlyPayPoints,
  fetchBalance,
  fetchCoupons,
  fetchFestival,
  fetchLedger,
  fetchLoyaltyMeta,
  issueCoupon,
  postEarn,
  reasonLabel,
  type AgentScore,
  type Coupon,
  type EarnReason,
  type LedgerEntry,
} from "@/lib/loyalty";

export const Route = createFileRoute("/loyalty")({
  head: () => ({
    meta: [
      { title: `${MODULE_LABEL} | ${BRAND.title}` },
      {
        name: "description",
        content: "باشگاه مشتریان و جشنواره نمایندگان — امتیاز، کوپن متقاطع، لیدربورد.",
      },
    ],
  }),
  component: LoyaltyPage,
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

function LoyaltyPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const [phCode, setPhCode] = useState("100200");
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  const [reason, setReason] = useState<EarnReason>("early_pay");
  const [paidJalali, setPaidJalali] = useState("1404/06/01");
  const [dueJalali, setDueJalali] = useState("1404/06/10");
  const [leadRef, setLeadRef] = useState("");

  const [triggerType, setTriggerType] = useState<string>("universal_life");

  const [leaderboard, setLeaderboard] = useState<AgentScore[]>([]);
  const [season, setSeason] = useState(DEFAULT_SEASON);
  const [topPoints, setTopPoints] = useState(0);
  const [agentCount, setAgentCount] = useState(0);

  const preview = earlyPayPoints(paidJalali, dueJalali);

  const refreshMeta = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meta = await fetchLoyaltyMeta();
      if (meta.ok && meta.counts) setCounts(meta.counts);
      const fest = await fetchFestival(season);
      if (fest.ok) {
        setLeaderboard(fest.leaderboard || []);
        setTopPoints(fest.topPoints ?? 0);
        setAgentCount(fest.agentCount ?? 0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در بارگذاری");
    } finally {
      setLoading(false);
    }
  }, [season]);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);

  async function onLoadBalance() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const [b, l, c] = await Promise.all([
        fetchBalance(phCode),
        fetchLedger(phCode),
        fetchCoupons(phCode),
      ]);
      if (!b.ok) {
        setError(b.error || "خطا");
        return;
      }
      setBalance(b.balance ?? 0);
      setLedger(l.items || []);
      setCoupons(c.items || []);
      setMsg(`موجودی: ${toFa(b.balance ?? 0)} امتیاز`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  async function onEarn() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const body: Parameters<typeof postEarn>[0] = {
        reason,
        policyholderCode: phCode,
      };
      if (reason === "early_pay") {
        body.paidDateJalali = paidJalali;
        body.dueDateJalali = dueJalali;
      }
      if (reason === "referral" && leadRef.trim()) body.leadRef = leadRef.trim();
      if (reason === "new_policy") body.policyType = "universal_life";
      const r = await postEarn(body);
      if (!r.ok) {
        setError(r.error || "خطا");
        return;
      }
      setBalance(r.balance ?? null);
      setMsg(`+${toFa(r.points ?? 0)} امتیاز ثبت شد · موجودی ${toFa(r.balance ?? 0)}`);
      await onLoadBalance();
      await refreshMeta();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  async function onIssueCoupon() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await issueCoupon({
        triggerPolicyType: triggerType,
        policyholderCode: phCode,
      });
      if (!r.ok) {
        setError(r.error || "خطا");
        return;
      }
      setMsg(
        r.issued
          ? `کوپن صادر شد: ${r.coupon?.code} (${toFa(r.coupon?.discountPercent ?? 0)}٪)`
          : `کوپن موجود: ${r.coupon?.code}`,
      );
      await onLoadBalance();
      await refreshMeta();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={MODULE_LABEL}
      description="امتیاز پورتفوی · کوپن متقاطع · جشنواره نمایندگان (DEMO)"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Gift className="size-4" aria-hidden />
          <span>نمایندگی ۳۰۴۵ · Eng-only · بدون wipe</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || loading}
          onClick={() => void refreshMeta()}
        >
          <RefreshCw className="size-4 ms-1" aria-hidden />
          تازه‌سازی
        </Button>
      </div>

      <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
        {DEMO_DISCLAIMER}
      </div>

      <div className="mb-6">
        <SectionCard
          title={SHOP_LABEL}
          description="لینک مستقیم فروشگاه عمومی کارآفرین · بدون ورود CRM · بدون پروکسی سرور"
        >
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{SHOP_OPEN_HINT}</p>
            {/* In-module browser chrome (URL bar + actions) — deep-link only */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/60 p-2">
              <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                className={`${FIELD} flex-1 min-w-[12rem] font-mono text-sm`}
                value={SHOP_URL}
                readOnly
                dir="ltr"
                aria-label="آدرس فروشگاه"
              />
              <Button asChild type="button">
                <a href={SHOP_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4 ms-1" aria-hidden />
                  {SHOP_OPEN_LABEL}
                </a>
              </Button>
              <Button asChild type="button" variant="outline">
                <a href={SHOP_URL} rel="noopener noreferrer">
                  باز کردن در همین تب
                </a>
              </Button>
            </div>
            {!SHOP_IFRAME_ALLOWED && (
              <p className="rounded-lg border border-border/50 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                جاسازی iframe فعال نیست — {SHOP_IFRAME_BLOCK_REASON}
              </p>
            )}
          </div>
        </SectionCard>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {msg && (
        <div className="mb-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          {msg}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FlatKpi label="موجودی انتخابی" value={toFa(balance ?? 0)} hint={`کد ${phCode || "—"}`} />
        <FlatKpi label="ثبت امتیاز" value={toFa(counts.ledger ?? 0)} hint="ledger" />
        <FlatKpi label="کوپن‌ها" value={toFa(counts.coupons ?? 0)} hint="متقاطع DEMO" />
        <FlatKpi
          label="نفر اول جشنواره"
          value={toFa(topPoints)}
          hint={`${toFa(agentCount)} نماینده · ${season}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="موجودی و کسب امتیاز" description="early_pay / new_policy / referral — نرخ DEMO قابل تنظیم">
          <div className="grid gap-3">
            <div>
              <Label htmlFor="ph">کد بیمه‌گذار (policyholderCode)</Label>
              <Input
                id="ph"
                className={FIELD}
                value={phCode}
                onChange={(e) => setPhCode(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void onLoadBalance()}>
                مشاهده موجودی / دفتر
              </Button>
            </div>
            <div>
              <Label htmlFor="reason">دلیل امتیاز</Label>
              <select
                id="reason"
                className={FIELD}
                value={reason}
                onChange={(e) => setReason(e.target.value as EarnReason)}
              >
                {EARN_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {reasonLabel(r)} ({r})
                  </option>
                ))}
              </select>
            </div>
            {reason === "early_pay" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="paid">تاریخ وصول جلالی</Label>
                  <Input
                    id="paid"
                    className={FIELD}
                    value={paidJalali}
                    onChange={(e) => setPaidJalali(e.target.value)}
                    dir="ltr"
                    placeholder="yyyy/mm/dd"
                  />
                </div>
                <div>
                  <Label htmlFor="due">سررسید جلالی</Label>
                  <Input
                    id="due"
                    className={FIELD}
                    value={dueJalali}
                    onChange={(e) => setDueJalali(e.target.value)}
                    dir="ltr"
                    placeholder="yyyy/mm/dd"
                  />
                </div>
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  پیش‌نمایش:{" "}
                  {preview.eligible
                    ? `${toFa(preview.daysEarly ?? 0)} روز زودتر → ${toFa(preview.points)} امتیاز (نرخ ${toFa(DEMO_RATES.early_pay_per_day)}/روز)`
                    : "واجد شرایط نیست"}
                </p>
              </div>
            )}
            {reason === "referral" && (
              <div>
                <Label htmlFor="lead">کد سرنخ (اختیاری)</Label>
                <Input
                  id="lead"
                  className={FIELD}
                  value={leadRef}
                  onChange={(e) => setLeadRef(e.target.value)}
                  dir="ltr"
                />
              </div>
            )}
            <Button type="button" disabled={busy} onClick={() => void onEarn()}>
              ثبت امتیاز
            </Button>
            {ledger.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
                {ledger.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2 border-b border-border/40 py-1">
                    <span>{reasonLabel(String(e.reason))}</span>
                    <span className="num font-bold">+{toFa(e.points)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="کوپن متقاطع"
          description="۲۰٪ آتش‌سوزی پس از خرید universal_life / omid_retirement (enum قفل)"
        >
          <div className="grid gap-3">
            <div>
              <Label htmlFor="trigger">رشته محرک (locked)</Label>
              <select
                id="trigger"
                className={FIELD}
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value)}
              >
                {LOCKED_TRIGGER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" disabled={busy} onClick={() => void onIssueCoupon()}>
              صدور کوپن ۲۰٪ آتش‌سوزی
            </Button>
            {coupons.length > 0 ? (
              <ul className="mt-2 max-h-48 space-y-2 overflow-auto text-sm">
                {coupons.map((c) => (
                  <li key={c.id} className="rounded-lg border border-border/50 bg-card/50 p-2">
                    <p className="font-mono text-sm">{c.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.label || `${toFa(c.discountPercent)}٪ ${c.couponInsuranceType}`}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">هنوز کوپنی برای این کد نیست.</p>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="mt-4">
        <SectionCard
          title="جشنواره نمایندگان — لیدربورد"
          description={`فصل ${season} · امتیاز فصلی به تفکیک agentCode / agency`}
        >
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="season">فصل</Label>
              <Input
                id="season"
                className={FIELD}
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                dir="ltr"
              />
            </div>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void refreshMeta()}>
              بارگذاری لیدربورد
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="px-2 py-2 text-start font-medium">رتبه</th>
                  <th className="px-2 py-2 text-start font-medium">کد</th>
                  <th className="px-2 py-2 text-start font-medium">نام</th>
                  <th className="px-2 py-2 text-start font-medium">امتیاز</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row) => (
                  <tr key={`${row.agentCode}-${row.season}`} className="border-b border-border/30">
                    <td className="px-2 py-2 num">{toFa(row.rank ?? 0)}</td>
                    <td className="px-2 py-2 font-mono" dir="ltr">
                      {row.agentCode}
                    </td>
                    <td className="px-2 py-2">{row.agentName || "—"}</td>
                    <td className="px-2 py-2 num font-bold">{toFa(row.points)}</td>
                  </tr>
                ))}
                {leaderboard.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">
                      {loading ? "در حال بارگذاری…" : "داده‌ای نیست"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        مسیر منو: سایر ← باشگاه · API: <span className="num">/api/loyalty/*</span> · فروشگاه:{" "}
        <a className="underline-offset-2 hover:underline" href={SHOP_URL} target="_blank" rel="noopener noreferrer" dir="ltr">
          {SHOP_URL}
        </a>{" "}
        · لینک آینده: policyholder_code / national_id / policy_number · بدون invent برای insurance_type
      </p>
    </AppShell>
  );
}
