import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, RefreshCw } from "lucide-react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";
import { toFa } from "@/lib/format";
import {
  DEMO_DISCLAIMER,
  MODULE_LABEL,
  PAPER_KINDS,
  calcVariance,
  directionLabel,
  fetchBranchOpsMeta,
  fetchChecks,
  fetchStock,
  fetchVariances,
  kindLabel,
  postCheck,
  postStockIssue,
  postStockReceive,
  postStockVoid,
  postVariance,
  statusLabel,
  type CheckItem,
  type StockItem,
  type VarianceItem,
} from "@/lib/branch-ops";

export const Route = createFileRoute("/branch-ops")({
  head: () => ({
    meta: [
      { title: `${MODULE_LABEL} | ${BRAND.title}` },
      {
        name: "description",
        content: "کارتابل شعب — موجودی اوراق، مغایرت کارمزد، چک بیمه‌گذار.",
      },
    ],
  }),
  component: BranchOpsPage,
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

function BranchOpsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const [stock, setStock] = useState<StockItem[]>([]);
  const [variances, setVariances] = useState<VarianceItem[]>([]);
  const [checks, setChecks] = useState<CheckItem[]>([]);

  const [kind, setKind] = useState<string>("receipt");
  const [serialFrom, setSerialFrom] = useState("REC-6001");
  const [serialTo, setSerialTo] = useState("REC-6003");
  const [branchCode, setBranchCode] = useState("BR-TEH-01");

  const [issueSerial, setIssueSerial] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [voidSerial, setVoidSerial] = useState("");
  const [voidReason, setVoidReason] = useState("");

  const [agentCode, setAgentCode] = useState("3045");
  const [agencyAmount, setAgencyAmount] = useState("12500000");
  const [branchAmount, setBranchAmount] = useState("12200000");
  const [varNote, setVarNote] = useState("");

  const [checkNumber, setCheckNumber] = useState("CHK-DEMO-1");
  const [checkAmount, setCheckAmount] = useState("5000000");
  const [checkPh, setCheckPh] = useState("100200");
  const [checkDue, setCheckDue] = useState("1404/07/15");

  const preview = calcVariance(Number(agencyAmount) || 0, Number(branchAmount) || 0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meta, s, v, c] = await Promise.all([
        fetchBranchOpsMeta(),
        fetchStock(),
        fetchVariances(),
        fetchChecks(),
      ]);
      if (meta.ok && meta.counts) setCounts(meta.counts);
      if (s.ok) setStock(s.items || []);
      if (v.ok) setVariances(v.items || []);
      if (c.ok) setChecks(c.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در بارگذاری");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onReceive() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await postStockReceive({ kind, serialFrom, serialTo, branchCode });
      if (!r.ok) {
        setError(r.error || "خطا در دریافت");
        return;
      }
      setMsg(`دریافت ${toFa(r.received ?? 0)} سریال`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  async function onIssue() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await postStockIssue({
        serial: issueSerial,
        policyNumber: policyNumber || undefined,
      });
      if (!r.ok) {
        setError(r.error || "خطا در صدور");
        return;
      }
      setMsg(r.issued ? `صادر شد: ${issueSerial}` : r.note || "قبلاً صادر شده");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  async function onVoid() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await postStockVoid({ serial: voidSerial, reason: voidReason });
      if (!r.ok) {
        setError(r.error || "خطا در ابطال");
        return;
      }
      setMsg(r.voided ? `ابطال شد: ${voidSerial}` : r.note || "قبلاً ابطال شده");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  async function onVariance() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await postVariance({
        agentCode,
        agencyAmount: Number(agencyAmount),
        branchAmount: Number(branchAmount),
        note: varNote || undefined,
      });
      if (!r.ok) {
        setError(r.error || "خطا در ثبت مغایرت");
        return;
      }
      setMsg(`مغایرت ثبت شد: ${toFa(r.item?.variance ?? 0)}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  async function onCheck() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await postCheck({
        checkNumber,
        amountRial: Number(checkAmount),
        policyholderCode: checkPh || undefined,
        dueJalali: checkDue || undefined,
      });
      if (!r.ok) {
        setError(r.error || "خطا در ثبت چک");
        return;
      }
      setMsg(r.created ? `چک ثبت شد: ${checkNumber}` : "چک قبلی بازگردانی شد");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={MODULE_LABEL}
      subtitle="کارتابل شعب · اوراق · مغایرت کارمزد · چک (DEMO)"
      leading={<Building2 className="size-5" aria-hidden />}
    >
      <div className="space-y-4" dir="rtl">
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          {DEMO_DISCLAIMER}
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {msg && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
            {msg}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-title">{MODULE_LABEL}</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading || busy}>
            <RefreshCw className="ms-1 size-4" />
            بروزرسانی
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FlatKpi label="موجودی اوراق" value={toFa(counts.stock ?? stock.length)} hint="سریال DEMO" />
          <FlatKpi label="حرکات" value={toFa(counts.movements ?? 0)} hint="لاگ چرخه" />
          <FlatKpi label="مغایرت‌ها" value={toFa(counts.variances ?? variances.length)} hint="نمایندگی ↔ شعبه" />
          <FlatKpi label="چک‌ها" value={toFa(counts.checks ?? checks.length)} hint="stub بیمه‌گذار" />
        </div>

        <SectionCard title="دریافت اوراق از شعبه">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>نوع</Label>
              <select className={FIELD} value={kind} onChange={(e) => setKind(e.target.value)}>
                {PAPER_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {kindLabel(k)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>از سریال</Label>
              <Input className={FIELD} value={serialFrom} onChange={(e) => setSerialFrom(e.target.value)} />
            </div>
            <div>
              <Label>تا سریال</Label>
              <Input className={FIELD} value={serialTo} onChange={(e) => setSerialTo(e.target.value)} />
            </div>
            <div>
              <Label>کد شعبه</Label>
              <Input className={FIELD} value={branchCode} onChange={(e) => setBranchCode(e.target.value)} />
            </div>
          </div>
          <Button className="mt-3" type="button" onClick={() => void onReceive()} disabled={busy}>
            ثبت دریافت
          </Button>
        </SectionCard>

        <SectionCard title="صدور / ابطال">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>سریال صدور</Label>
              <Input className={FIELD} value={issueSerial} onChange={(e) => setIssueSerial(e.target.value)} />
              <Label>شماره بیمه‌نامه (اختیاری)</Label>
              <Input className={FIELD} value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} />
              <Button type="button" onClick={() => void onIssue()} disabled={busy || !issueSerial}>
                صدور
              </Button>
            </div>
            <div className="space-y-2">
              <Label>سریال ابطال</Label>
              <Input className={FIELD} value={voidSerial} onChange={(e) => setVoidSerial(e.target.value)} />
              <Label>دلیل</Label>
              <Input className={FIELD} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
              <Button type="button" variant="destructive" onClick={() => void onVoid()} disabled={busy || !voidSerial || !voidReason}>
                ابطال
              </Button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="جدول موجودی">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-2 text-right">سریال</th>
                  <th className="p-2 text-right">نوع</th>
                  <th className="p-2 text-right">وضعیت</th>
                  <th className="p-2 text-right">شعبه</th>
                  <th className="p-2 text-right">بیمه‌نامه</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((row) => (
                  <tr key={row.serial} className="border-b border-border/40">
                    <td className="p-2 font-mono text-xs">{row.serial}</td>
                    <td className="p-2">{kindLabel(row.kind)}</td>
                    <td className="p-2">{statusLabel(row.status)}</td>
                    <td className="p-2">{row.branchCode}</td>
                    <td className="p-2">{row.policyNumber || "—"}</td>
                  </tr>
                ))}
                {!stock.length && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                      {loading ? "در حال بارگذاری…" : "موردی نیست"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="مغایرت کارمزد (نمایندگی ↔ کارتابل شعبه)">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>کد نماینده</Label>
              <Input className={FIELD} value={agentCode} onChange={(e) => setAgentCode(e.target.value)} />
            </div>
            <div>
              <Label>مبلغ نمایندگی</Label>
              <Input className={FIELD} value={agencyAmount} onChange={(e) => setAgencyAmount(e.target.value)} />
            </div>
            <div>
              <Label>مبلغ شعبه</Label>
              <Input className={FIELD} value={branchAmount} onChange={(e) => setBranchAmount(e.target.value)} />
            </div>
            <div>
              <Label>یادداشت</Label>
              <Input className={FIELD} value={varNote} onChange={(e) => setVarNote(e.target.value)} />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            پیش‌نمایش: {preview.ok ? `${toFa(preview.variance ?? 0)} — ${directionLabel(preview.direction || "")}` : "—"}
          </p>
          <Button className="mt-2" type="button" onClick={() => void onVariance()} disabled={busy}>
            ثبت مغایرت
          </Button>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-2 text-right">نماینده</th>
                  <th className="p-2 text-right">نمایندگی</th>
                  <th className="p-2 text-right">شعبه</th>
                  <th className="p-2 text-right">مغایرت</th>
                  <th className="p-2 text-right">جهت</th>
                </tr>
              </thead>
              <tbody>
                {variances.map((row) => (
                  <tr key={row.id} className="border-b border-border/40">
                    <td className="p-2">{row.agentCode}</td>
                    <td className="p-2">{toFa(row.agencyAmount)}</td>
                    <td className="p-2">{toFa(row.branchAmount)}</td>
                    <td className="p-2">{toFa(row.variance)}</td>
                    <td className="p-2">{directionLabel(row.direction)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="چک بیمه‌گذار (stub)">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>شماره چک</Label>
              <Input className={FIELD} value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
            </div>
            <div>
              <Label>مبلغ (ریال)</Label>
              <Input className={FIELD} value={checkAmount} onChange={(e) => setCheckAmount(e.target.value)} />
            </div>
            <div>
              <Label>کد بیمه‌گذار</Label>
              <Input className={FIELD} value={checkPh} onChange={(e) => setCheckPh(e.target.value)} />
            </div>
            <div>
              <Label>سررسید جلالی</Label>
              <Input className={FIELD} value={checkDue} onChange={(e) => setCheckDue(e.target.value)} />
            </div>
          </div>
          <Button className="mt-3" type="button" onClick={() => void onCheck()} disabled={busy}>
            ثبت چک
          </Button>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-2 text-right">شماره</th>
                  <th className="p-2 text-right">مبلغ</th>
                  <th className="p-2 text-right">بیمه‌گذار</th>
                  <th className="p-2 text-right">سررسید</th>
                  <th className="p-2 text-right">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((row) => (
                  <tr key={row.id} className="border-b border-border/40">
                    <td className="p-2 font-mono text-xs">{row.checkNumber}</td>
                    <td className="p-2">{toFa(row.amountRial)}</td>
                    <td className="p-2">{row.policyholderCode || "—"}</td>
                    <td className="p-2">{row.dueJalali || "—"}</td>
                    <td className="p-2">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
