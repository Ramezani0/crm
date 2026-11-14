import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, ShieldBan } from "lucide-react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";
import { formatNumber, toFa } from "@/lib/format";
import {
  DEFAULT_SYMBOL,
  FEE_ENTRY_PCT,
  FEE_EXIT_PCT,
  LOAN_BLOCK_REASON_FA,
  SOURCE_LABEL_TGJU,
  depositSimaZar,
  fetchSimaZarPositions,
  fetchSimaZarRate,
  gramsToMilligrams,
  milligramsToGrams,
  previewFeesLocal,
  putSimaZarRate,
  redeemSimaZar,
  type FeePreview,
  type SimaZarPosition,
  type SimaZarRate,
} from "@/lib/sima-zar";

export const Route = createFileRoute("/sima-zar")({
  head: () => ({
    meta: [
      { title: `سیما زر | ${BRAND.title}` },
      {
        name: "description",
        content: "اندوخته طلا سیما زر — نرخ معادل گرم از گواهی سپرده شمش بورس کالا (tgju)، کارمزد صدور/ابطال، بلاک وام.",
      },
    ],
  }),
  component: SimaZarPage,
});

const FIELD =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Flat CSS KPI — no Three.js / no canvas. */
function FlatKpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="glass rounded-2xl border border-border/60 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-extrabold text-title">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function formatUpdatedFa(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Tehran",
    }).format(d);
  } catch {
    return iso;
  }
}

function SimaZarPage() {
  const [rate, setRate] = useState<SimaZarRate | null>(null);
  const [positions, setPositions] = useState<SimaZarPosition[]>([]);
  const [totalMg, setTotalMg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiLive, setApiLive] = useState(false);
  const [liveRate, setLiveRate] = useState<number | null>(null);

  const [gramsIn, setGramsIn] = useState("1");
  const [mgIn, setMgIn] = useState("1000");
  const [customerId, setCustomerId] = useState("");
  const [manualRate, setManualRate] = useState("");
  const [side, setSide] = useState<"entry" | "exit">("entry");
  const [preview, setPreview] = useState<FeePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedPos, setSelectedPos] = useState<number | null>(null);
  const [redeemMg, setRedeemMg] = useState("100");

  const reload = useCallback(async (opts?: { refresh?: boolean }) => {
    setLoading(true);
    setError(null);
    const [r, p] = await Promise.all([
      fetchSimaZarRate({ refresh: opts?.refresh }),
      fetchSimaZarPositions(),
    ]);
    setRate(r);
    if (r.ok && r.live && Number.isFinite(r.rialPerGram) && r.rialPerGram > 0) {
      setApiLive(true);
      setLiveRate(r.rialPerGram);
      // Sync manual field from live only when empty or previously mirrored live
      setManualRate((prev) => (prev.trim() === "" ? String(r.rialPerGram) : prev));
    } else if (r.ok && !r.live) {
      setApiLive(true); // API reachable
      const failMsg =
        r.error ||
        "نرخ زنده tgju در دسترس نیست — نرخ دستی حفظ شد (DEMO_STUB به‌عنوان منبع اصلی استفاده نمی‌شود).";
      setError(failMsg);
      // Keep manual rate — do NOT overwrite with stub/DEMO
      if (
        (r.source === "MANUAL" || r.source === "ENV") &&
        Number.isFinite(r.rialPerGram) &&
        r.rialPerGram > 0
      ) {
        setManualRate((prev) => (prev.trim() === "" ? String(r.rialPerGram) : prev));
      }
      if (r.source === "tgju" && Number.isFinite(r.rialPerGram) && r.rialPerGram > 0) {
        setLiveRate(r.rialPerGram);
      }
    } else {
      setApiLive(false);
      setError(r.error || "API سیما زر در دسترس نیست — نرخ دستی حفظ می‌شود.");
    }
    if (p.ok) {
      setPositions(p.items);
      setTotalMg(p.totalMilligrams);
      if (p.items.length && selectedPos == null) setSelectedPos(p.items[0].id);
    }
    setLoading(false);
  }, [selectedPos]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Prefer user manual, then last live — never silent 35M stub as primary display. */
  const rateVal = useMemo(() => {
    const m = Number(manualRate);
    if (Number.isFinite(m) && m > 0) return m;
    if (liveRate != null && liveRate > 0) return liveRate;
    if (
      rate &&
      rate.live &&
      Number.isFinite(rate.rialPerGram) &&
      rate.rialPerGram > 0 &&
      !rate.demoStub
    ) {
      return rate.rialPerGram;
    }
    return null;
  }, [manualRate, liveRate, rate]);

  const localPreview = useMemo(() => {
    const g = Number(gramsIn);
    if (rateVal == null) {
      return { ok: false, error: "نرخ معتبر نیست — نرخ زنده یا دستی را تنظیم کنید" } as FeePreview;
    }
    return previewFeesLocal({
      grams: Number.isFinite(g) ? g : 0,
      rateRialPerGram: rateVal,
      side,
    });
  }, [gramsIn, rateVal, side]);

  useEffect(() => {
    setPreview(localPreview);
  }, [localPreview]);

  const onGramsChange = (v: string) => {
    setGramsIn(v);
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) setMgIn(String(gramsToMilligrams(n)));
  };
  const onMgChange = (v: string) => {
    setMgIn(v);
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) setGramsIn(String(milligramsToGrams(n)));
  };

  const saveRate = async () => {
    setBusy(true);
    setMsg(null);
    const n = Number(manualRate);
    if (!Number.isFinite(n) || n <= 0) {
      setMsg("نرخ نامعتبر");
      setBusy(false);
      return;
    }
    try {
      const r = await putSimaZarRate({
        rialPerGram: n,
        symbol: rate?.symbol || DEFAULT_SYMBOL,
        notes: "MANUAL via UI",
      });
      if (r.ok) {
        setRate(r);
        setLiveRate(null); // manual overrides live display until next refresh
        setMsg("نرخ دستی ذخیره شد.");
      } else {
        setMsg(r.error || "خطا در ذخیره نرخ");
      }
    } catch {
      setMsg("API در دسترس نیست");
    }
    setBusy(false);
  };

  const doDeposit = async () => {
    setBusy(true);
    setMsg(null);
    const g = Number(gramsIn);
    if (!Number.isFinite(g) || g <= 0) {
      setMsg("مقدار گرم نامعتبر");
      setBusy(false);
      return;
    }
    if (rateVal == null) {
      setMsg("نرخ معتبر نیست — ابتدا نرخ زنده را بگیرید یا نرخ دستی ذخیره کنید");
      setBusy(false);
      return;
    }
    try {
      const res = await depositSimaZar({
        grams: g,
        customerId: customerId.trim() || undefined,
        useRate: rateVal,
      });
      if (res.ok) {
        setMsg(
          `واریز موفق — کارمزد صدور ${toFa(formatNumber(res.deposit?.feeEntryRial ?? 0))} ریال`,
        );
        await reload();
      } else {
        setMsg(res.error || "خطا در واریز");
      }
    } catch {
      setMsg("API در دسترس نیست — فقط پیش‌نمایش محلی");
    }
    setBusy(false);
  };

  const doRedeem = async () => {
    setBusy(true);
    setMsg(null);
    if (selectedPos == null) {
      setMsg("موقعیت انتخاب نشده");
      setBusy(false);
      return;
    }
    const mg = Number(redeemMg);
    if (!Number.isFinite(mg) || mg <= 0) {
      setMsg("میلی‌گرم نامعتبر");
      setBusy(false);
      return;
    }
    if (rateVal == null) {
      setMsg("نرخ معتبر نیست — ابتدا نرخ زنده یا دستی را تنظیم کنید");
      setBusy(false);
      return;
    }
    try {
      const res = await redeemSimaZar({
        positionId: selectedPos,
        milligrams: mg,
        useRate: rateVal,
      });
      if (res.ok) {
        setMsg(
          `بازخرید موفق — کارمزد ابطال ${toFa(formatNumber(res.redeem?.feeExitRial ?? 0))} ریال · خالص ${toFa(formatNumber(res.redeem?.netPayoutRial ?? 0))} ریال`,
        );
        await reload();
      } else {
        setMsg(res.error || "خطا در بازخرید");
      }
    } catch {
      setMsg("API در دسترس نیست");
    }
    setBusy(false);
  };

  return (
    <AppShell
      title="سیما زر"
      subtitle="اندوخته طلا — نرخ ۲۴ عیار (معادل گرم) گواهی سپرده شمش بورس کالا · بلاک وام"
      permission="tools.view"
    >
      <div
        role="alert"
        className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
      >
        <ShieldBan className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="font-bold text-destructive">{LOAN_BLOCK_REASON_FA}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            محصول سیما زر همیشه <span className="num">loanBlocked: true</span> است — درخواست وام
            از API رد می‌شود.
          </p>
        </div>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FlatKpi
          label="نرخ (ریال/گرم)"
          value={rateVal != null ? toFa(formatNumber(rateVal)) : "—"}
          hint={`${rate?.symbol || DEFAULT_SYMBOL} · ${rate?.sourceLabel || rate?.source || "—"}`}
        />
        <FlatKpi
          label="کارمزد صدور"
          value={`٪${toFa(FEE_ENTRY_PCT)}`}
          hint="ورود / واریز دارایی"
        />
        <FlatKpi
          label="کارمزد ابطال"
          value={`٪${toFa(FEE_EXIT_PCT)}`}
          hint="خروج / بازخرید"
        />
        <FlatKpi
          label="موجودی کل"
          value={`${toFa(milligramsToGrams(totalMg).toFixed(6))} g`}
          hint={`${toFa(totalMg.toFixed(3))} mg · ${apiLive ? "API" : "محلی"}`}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void reload({ refresh: true })}
          disabled={loading}
        >
          <RefreshCw className="size-3.5" />
          بروزرسانی زنده
        </Button>
        <span className="text-[11px] text-muted-foreground">
          منبع: <strong>{rate?.live ? SOURCE_LABEL_TGJU : rate?.sourceLabel || rate?.source || "—"}</strong>
          {" · "}
          زمان: {formatUpdatedFa(rate?.updatedAt || rate?.asOf)}
          {rate?.live ? " · زنده" : rate?.configured ? " · زنده ناموفق" : ""}
        </span>
      </div>

      {rate?.live === false && rate?.configured ? (
        <p
          role="status"
          className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          {rate.error ||
            "نرخ زنده دریافت نشد — نرخ دستی شما حفظ شده است. DEMO_STUB دیگر مسیر اصلی نیست."}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="نرخ روزانه"
          description={
            rate?.live
              ? SOURCE_LABEL_TGJU
              : "در صورت قطعی tgju، نرخ دستی را نگه دارید / ذخیره کنید"
          }
        >
          <div className="space-y-3">
            <div>
              <Label htmlFor="sz-symbol">نماد طلا</Label>
              <Input id="sz-symbol" className={FIELD} value={rate?.symbol || DEFAULT_SYMBOL} readOnly />
            </div>
            <div>
              <Label htmlFor="sz-rate">ریال به ازای هر گرم (دستی / پشتیبان)</Label>
              <Input
                id="sz-rate"
                className={`${FIELD} num`}
                value={manualRate}
                onChange={(e) => setManualRate(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <Button type="button" onClick={() => void saveRate()} disabled={busy}>
              ذخیره نرخ دستی
            </Button>
            <p className="text-[11px] text-muted-foreground">
              env: <span className="num">SIMA_ZAR_RATE_SOURCE</span> ·{" "}
              <span className="num">SIMA_ZAR_RATE_URL</span> ·{" "}
              <span className="num">SIMA_ZAR_SYMBOL</span>
            </p>
          </div>
        </SectionCard>

        <SectionCard title="تبدیل و پیش‌نمایش کارمزد" description="۱ گرم = ۱۰۰۰ میلی‌گرم">
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm ${side === "entry" ? "bg-primary/15 font-semibold text-primary" : "bg-muted"}`}
                onClick={() => setSide("entry")}
              >
                صدور (٪{toFa(1)})
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm ${side === "exit" ? "bg-primary/15 font-semibold text-primary" : "bg-muted"}`}
                onClick={() => setSide("exit")}
              >
                ابطال (٪{toFa(2)})
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="sz-g">گرم</Label>
                <Input
                  id="sz-g"
                  className={`${FIELD} num`}
                  value={gramsIn}
                  onChange={(e) => onGramsChange(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div>
                <Label htmlFor="sz-mg">میلی‌گرم</Label>
                <Input
                  id="sz-mg"
                  className={`${FIELD} num`}
                  value={mgIn}
                  onChange={(e) => onMgChange(e.target.value)}
                  inputMode="decimal"
                />
              </div>
            </div>
            {preview?.ok ? (
              <ul className="space-y-1 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
                <li>
                  ارزش دارایی:{" "}
                  <strong className="num">{toFa(formatNumber(preview.assetValueRial ?? 0))}</strong> ریال
                </li>
                <li>
                  کارمزد (٪{toFa(preview.feePct ?? 0)}):{" "}
                  <strong className="num">{toFa(formatNumber(preview.feeRial ?? 0))}</strong> ریال
                </li>
                <li>
                  {side === "entry" ? "مبلغ پرداختی" : "خالص بازخرید"}:{" "}
                  <strong className="num">
                    {toFa(formatNumber(side === "entry" ? (preview.totalRial ?? 0) : (preview.netRial ?? 0)))}
                  </strong>{" "}
                  ریال
                </li>
              </ul>
            ) : (
              <p className="text-sm text-destructive">{preview?.error}</p>
            )}
            <div>
              <Label htmlFor="sz-cid">شناسه مشتری (اختیاری)</Label>
              <Input
                id="sz-cid"
                className={`${FIELD} num`}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              />
            </div>
            <Button type="button" onClick={() => void doDeposit()} disabled={busy || side !== "entry"}>
              واریز دارایی (صدور)
            </Button>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="موقعیت‌ها و بازخرید" className="mt-4">
        {positions.length === 0 ? (
          <p className="text-sm text-muted-foreground">هنوز موقعیتی ثبت نشده.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-2 py-2 text-right font-medium">#</th>
                  <th className="px-2 py-2 text-right font-medium">مشتری</th>
                  <th className="px-2 py-2 text-right font-medium">گرم</th>
                  <th className="px-2 py-2 text-right font-medium">میلی‌گرم</th>
                  <th className="px-2 py-2 text-right font-medium">وام</th>
                  <th className="px-2 py-2 text-right font-medium">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr
                    key={p.id}
                    className={`cursor-pointer border-b border-border/40 ${selectedPos === p.id ? "bg-primary/10" : "hover:bg-muted/40"}`}
                    onClick={() => setSelectedPos(p.id)}
                  >
                    <td className="num px-2 py-2">{toFa(p.id)}</td>
                    <td className="px-2 py-2">{p.customerLabel || p.customerId || "—"}</td>
                    <td className="num px-2 py-2">{toFa(p.grams.toFixed(6))}</td>
                    <td className="num px-2 py-2">{toFa(p.milligrams.toFixed(3))}</td>
                    <td className="px-2 py-2 text-destructive">مسدود</td>
                    <td className="px-2 py-2">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="sz-redeem-mg">میلی‌گرم بازخرید</Label>
            <Input
              id="sz-redeem-mg"
              className={`${FIELD} num w-40`}
              value={redeemMg}
              onChange={(e) => setRedeemMg(e.target.value)}
            />
          </div>
          <Button type="button" variant="secondary" onClick={() => void doRedeem()} disabled={busy || selectedPos == null}>
            بازخرید / ابطال
          </Button>
        </div>
      </SectionCard>

      {msg ? (
        <p className="mt-3 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">{msg}</p>
      ) : null}

      <p className="mt-6 text-[11px] text-muted-foreground">
        مسیر منو: سایر ← سیما زر · API: <span className="num">/api/sima-zar/*</span> · M1 شبکه فروش
        حفظ شده است.
      </p>
    </AppShell>
  );
}
