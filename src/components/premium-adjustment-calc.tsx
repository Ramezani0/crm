/**
 * Premium adjustment calculator — lux RTL table (no Three/canvas).
 * Emerald/gold via existing glass + brand tokens. 3D stays on login/dashboard only.
 *
 * P1 ladder: P0 = initialPremiumStart (Excel start-year IP);
 * never auto-ladder from initialPremium (latest endorsement).
 * r from premiumAdjPct/100 (omid → 0.10); schedule startYear→1405.
 */
import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CTA_BUTTON_CLASS } from "@/lib/button-brand";
import { formatNumber, formatRial, formatToman, toFa } from "@/lib/format";
import {
  DIYA_1405_VERIFIED,
  DIYA_DEFAULT_YEAR,
  LIFE_RATES,
  RETIREMENT_RATE,
  endorsementIncreaseNote,
  formatRatePercent,
  inferProductFromKind,
  isPremiumLadderKind,
  parseJalaliYear,
  premiumSchedule,
  rateFromAdjPct,
  resolveLadderP0,
  yearsThroughTarget,
  type PremiumProduct,
  type PremiumYearRow,
} from "@/lib/premium-adjustment";
import { apiFetch, apiUrl } from "@/lib/api";
import type { Policy } from "@/lib/types";

function parsePositiveNumber(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function seedFromPolicy(policy: Policy | undefined): {
  product: PremiumProduct;
  p0Text: string;
  lifeRate: number;
  yearsText: string;
  startYear: number | null;
  autoRows: PremiumYearRow[] | null;
  endorsementNote: string | null;
  p0Warning: string | null;
  latestPremium: number | null;
  startPremium: number | null;
} {
  const product = inferProductFromKind(policy?.kind ?? policy?.kindRaw);
  const startYear = parseJalaliYear(policy?.startDate);
  const years =
    startYear != null ? yearsThroughTarget(startYear, DIYA_DEFAULT_YEAR) : 10;
  const r = rateFromAdjPct(product, policy?.premiumAdjPct);
  const resolved = resolveLadderP0(policy);
  const p0 = resolved.p0;
  const canAuto =
    Boolean(policy && isPremiumLadderKind(policy.kind ?? policy.kindRaw)) &&
    p0 != null &&
    startYear != null;
  const autoRows =
    canAuto && p0 != null && startYear != null
      ? premiumSchedule(p0, r, years, startYear)
      : null;
  return {
    product,
    // Empty when start missing — do not prefill inflated latest endorsement
    p0Text: p0 != null ? String(p0) : "",
    lifeRate: product === "life" ? r : 0.1,
    yearsText: String(years),
    startYear,
    autoRows,
    endorsementNote: endorsementIncreaseNote(policy?.extras),
    p0Warning: resolved.warning,
    latestPremium: resolved.latestPremium,
    startPremium: p0,
  };
}

export function PremiumAdjustmentCalc({ policies = [] }: { policies?: Policy[] }) {
  const ladderPolicies = useMemo(
    () => policies.filter((p) => isPremiumLadderKind(p.kind ?? p.kindRaw)),
    [policies],
  );
  const first = ladderPolicies[0] ?? policies[0];
  const seeded = useMemo(() => seedFromPolicy(first), [first]);

  const [product, setProduct] = useState<PremiumProduct>(seeded.product);
  const [p0Text, setP0Text] = useState(seeded.p0Text);
  const [lifeRate, setLifeRate] = useState<number>(seeded.lifeRate);
  const [yearsText, setYearsText] = useState(seeded.yearsText);
  const [startYear, setStartYear] = useState<number | null>(seeded.startYear);
  const [rows, setRows] = useState<PremiumYearRow[] | null>(seeded.autoRows);
  const [apiNote, setApiNote] = useState<string | null>(
    seeded.autoRows
      ? `نردبان خودکار تا ${toFa(DIYA_DEFAULT_YEAR)} از حق بیمه اولیه (شروع)`
      : seeded.p0Warning,
  );
  const [endorsementNote, setEndorsementNote] = useState<string | null>(
    seeded.endorsementNote,
  );
  const [p0Warning, setP0Warning] = useState<string | null>(seeded.p0Warning);
  const [latestPremium, setLatestPremium] = useState<number | null>(
    seeded.latestPremium,
  );
  const [startPremium, setStartPremium] = useState<number | null>(seeded.startPremium);
  const [busy, setBusy] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState(first?.id ?? "");

  // Re-seed when dossier ladder policies arrive / change
  useEffect(() => {
    const next = seedFromPolicy(first);
    setProduct(next.product);
    setP0Text(next.p0Text);
    setLifeRate(next.lifeRate);
    setYearsText(next.yearsText);
    setStartYear(next.startYear);
    setEndorsementNote(next.endorsementNote);
    setP0Warning(next.p0Warning);
    setLatestPremium(next.latestPremium);
    setStartPremium(next.startPremium);
    setSelectedPolicyId(first?.id ?? "");
    if (next.autoRows) {
      setRows(next.autoRows);
      setApiNote(
        `نردبان خودکار تا ${toFa(DIYA_DEFAULT_YEAR)} از حق بیمه اولیه (شروع)`,
      );
    } else {
      setRows(null);
      setApiNote(next.p0Warning);
    }
  }, [first]);

  // lifeRate holds fraction (0.1); retirement locks 0.10
  const effectiveR = product === "retirement" ? RETIREMENT_RATE : lifeRate;

  const localPreview = useMemo(() => {
    const p0 = parsePositiveNumber(p0Text);
    const years = parsePositiveNumber(yearsText);
    if (p0 === null || years === null || years < 1) return null;
    const start = startYear ?? DIYA_DEFAULT_YEAR;
    return premiumSchedule(p0, effectiveR, Math.min(Math.floor(years), 100), start);
  }, [p0Text, yearsText, effectiveR, startYear]);

  const selectedPolicy =
    policies.find((x) => x.id === selectedPolicyId) ?? first ?? undefined;
  const excelPremium =
    selectedPolicy && selectedPolicy.premium > 0 ? selectedPolicy.premium : null;
  const row1405 = (rows ?? localPreview)?.find((row) => row.jalaliYear === DIYA_DEFAULT_YEAR);

  const applyPolicy = (policyId: string) => {
    const p = policies.find((x) => x.id === policyId);
    if (!p) return;
    setSelectedPolicyId(policyId);
    const next = seedFromPolicy(p);
    setProduct(next.product);
    setP0Text(next.p0Text);
    setLifeRate(next.lifeRate);
    setYearsText(next.yearsText);
    setStartYear(next.startYear);
    setEndorsementNote(next.endorsementNote);
    setP0Warning(next.p0Warning);
    setLatestPremium(next.latestPremium);
    setStartPremium(next.startPremium);
    if (next.autoRows) {
      setRows(next.autoRows);
      setApiNote(
        `نردبان خودکار تا ${toFa(DIYA_DEFAULT_YEAR)} از حق بیمه اولیه (شروع)`,
      );
    } else {
      setRows(null);
      setApiNote(next.p0Warning);
    }
  };

  const runLocal = () => {
    setApiNote(null);
    if (!localPreview || localPreview.length === 0) {
      setRows(null);
      setApiNote("مقادیر نامعتبر — P₀ و تعداد سال را بررسی کنید.");
      return;
    }
    setRows(localPreview);
  };

  const runApi = async () => {
    const p0 = parsePositiveNumber(p0Text);
    const years = parsePositiveNumber(yearsText);
    if (p0 === null || years === null || years < 1) {
      setApiNote("مقادیر نامعتبر برای API.");
      return;
    }
    const start = startYear ?? DIYA_DEFAULT_YEAR;
    setBusy(true);
    setApiNote(null);
    try {
      const res = await apiFetch(apiUrl("/api/calc/premium-adjustment"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p0,
          r: effectiveR,
          years: Math.min(Math.floor(years), 100),
          startYear: start,
        }),
      });
      const data = (await res.json()) as
        | PremiumYearRow[]
        | { ok?: boolean; error?: string; rows?: PremiumYearRow[] };
      if (Array.isArray(data)) {
        setRows(data);
        setApiNote("محاسبه از API");
      } else if (data.rows && Array.isArray(data.rows)) {
        setRows(data.rows);
        setApiNote("محاسبه از API");
      } else {
        setApiNote(data.error || "پاسخ API نامعتبر");
        if (localPreview) setRows(localPreview);
      }
    } catch {
      setApiNote("API در دسترس نیست — جدول محلی نمایش داده شد.");
      if (localPreview) setRows(localPreview);
    } finally {
      setBusy(false);
    }
  };

  const display = rows ?? localPreview;
  const total =
    display && display.length
      ? display.reduce((s, row) => s + row.premiumRial, 0)
      : null;

  return (
    <SectionCard
      title="ماشین‌حساب تعدیل حق‌بیمه"
      description={`Pₙ = P₀ × (۱+r)ⁿ⁻¹ · نردبان تا ${toFa(DIYA_DEFAULT_YEAR)} · بدون ۳بعدی`}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="space-y-3 rounded-xl border border-[color-mix(in_srgb,var(--brand-gold)_36%,var(--border))] bg-[color-mix(in_srgb,var(--brand-emerald)_6%,transparent)] p-3">
          {policies.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="pac-policy">پیش‌فرض از بیمه‌نامه پرونده</Label>
              <select
                id="pac-policy"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedPolicyId}
                onChange={(e) => {
                  if (e.target.value) applyPolicy(e.target.value);
                }}
              >
                <option value="">— انتخاب بیمه‌نامه —</option>
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.number || p.id} · {p.kind || "رشته؟"}
                    {p.initialPremiumStart && p.initialPremiumStart > 0
                      ? ` · شروع ${formatNumber(p.initialPremiumStart)}`
                      : p.initialPremium && p.initialPremium > 0
                        ? ` · الحاقیه ${formatNumber(p.initialPremium)}`
                        : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {excelPremium != null ? (
            <div className="rounded-lg border border-border/70 bg-card/50 px-3 py-2 text-xs">
              <span className="text-muted-foreground">کل حق بیمه اکسل: </span>
              <span className="num font-semibold text-title">{formatRial(excelPremium)}</span>
              <p className="mt-1 text-[10px] text-muted-foreground">
                این مبلغ با نردبان محاسبه‌ای قاطی نمی‌شود — P₀ از حق بیمه اولیه (شروع) است.
              </p>
            </div>
          ) : null}

          {startPremium != null || latestPremium != null ? (
            <div className="space-y-1.5 rounded-lg border border-border/70 bg-card/50 px-3 py-2 text-xs">
              {startPremium != null ? (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">حق بیمه اولیه (شروع)</span>
                  <span className="num font-semibold text-title">{formatRial(startPremium)}</span>
                </div>
              ) : null}
              {latestPremium != null ? (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">آخرین الحاقیه</span>
                  <span className="num text-title">{formatRial(latestPremium)}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {p0Warning ? (
            <p className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
              {p0Warning}
            </p>
          ) : null}

          {row1405 ? (
            <div className="rounded-lg border border-[color-mix(in_srgb,var(--brand-emerald)_40%,var(--border))] bg-[color-mix(in_srgb,var(--brand-emerald)_10%,transparent)] px-3 py-2 text-xs">
              <span className="font-semibold text-title">حق‌بیمه محاسبه‌شده سال ۱۴۰۵: </span>
              <span className="num font-bold text-title">{formatRial(row1405.premiumRial)}</span>
              <span className="ms-2 num text-muted-foreground">
                ({formatToman(row1405.premiumRial)})
              </span>
            </div>
          ) : null}

          {endorsementNote ? (
            <p className="rounded-lg border border-dashed border-border/80 px-3 py-2 text-[11px] text-muted-foreground">
              {endorsementNote}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label>محصول</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={product === "life" ? "default" : "outline"}
                className={product === "life" ? CTA_BUTTON_CLASS : undefined}
                onClick={() => setProduct("life")}
              >
                عمر
              </Button>
              <Button
                type="button"
                size="sm"
                variant={product === "retirement" ? "default" : "outline"}
                className={product === "retirement" ? CTA_BUTTON_CLASS : undefined}
                onClick={() => {
                  setProduct("retirement");
                  setLifeRate(RETIREMENT_RATE);
                }}
              >
                بازنشستگی
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {product === "retirement"
                ? `نرخ قفل‌شده ${formatRatePercent(RETIREMENT_RATE)}`
                : "نرخ از گزینه‌های اکسل/بیمه‌نامه"}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pac-p0">حق بیمه اولیه (شروع) P₀ (ریال)</Label>
            <Input
              id="pac-p0"
              className="num"
              inputMode="numeric"
              value={p0Text}
              onChange={(e) => setP0Text(e.target.value)}
              dir="ltr"
            />
            {startYear != null ? (
              <p className="text-[11px] text-muted-foreground">
                سال شروع جلالی: <span className="num text-title">{toFa(startYear)}</span>
              </p>
            ) : null}
          </div>

          {product === "life" ? (
            <div className="space-y-1.5">
              <Label htmlFor="pac-r">نرخ تعدیل r</Label>
              <select
                id="pac-r"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm num"
                value={String(lifeRate)}
                onChange={(e) => setLifeRate(Number(e.target.value))}
              >
                {LIFE_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {formatRatePercent(rate)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded-lg border border-border/70 px-3 py-2 text-sm">
              <span className="text-muted-foreground">r = </span>
              <span className="num font-semibold text-title">{formatRatePercent(RETIREMENT_RATE)}</span>
              <span className="ms-2 text-[11px] text-muted-foreground">(ثابت)</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pac-years">تعداد سال (n از ۱ تا ۱۴۰۵)</Label>
            <Input
              id="pac-years"
              className="num"
              inputMode="numeric"
              value={yearsText}
              onChange={(e) => setYearsText(e.target.value)}
              dir="ltr"
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" className={CTA_BUTTON_CLASS} onClick={runLocal}>
              محاسبه جدول
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void runApi()}>
              {busy ? "…" : "از API"}
            </Button>
          </div>
          {apiNote ? <p className="text-[11px] text-muted-foreground">{apiNote}</p> : null}

          <div className="rounded-lg border border-[color-mix(in_srgb,var(--brand-gold)_28%,var(--border))] bg-card/60 px-3 py-2 text-xs">
            <p className="font-semibold text-title">
              دیه {toFa(DIYA_DEFAULT_YEAR)}{" "}
              <span className="ms-1 rounded bg-[color-mix(in_srgb,var(--brand-emerald)_22%,transparent)] px-1.5 py-0.5 text-[10px] text-[var(--brand-emerald)]">
                VERIFIED · {DIYA_1405_VERIFIED.sourceLabel}
              </span>
            </p>
            <dl className="mt-2 grid gap-1 text-muted-foreground">
              <div className="flex justify-between gap-2">
                <dt>عادی</dt>
                <dd className="num text-foreground">{formatToman(DIYA_1405_VERIFIED.ordinaryRial)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>حرام</dt>
                <dd className="num text-foreground">{formatToman(DIYA_1405_VERIFIED.haramRial)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>حداقل مالی شخص ثالث ≈</dt>
                <dd className="num text-foreground">
                  {formatToman(DIYA_1405_VERIFIED.thirdPartyPropertyMinRial)}
                </dd>
              </div>
            </dl>
            <p className="mt-1 text-[10px] text-muted-foreground">مرجع دانش — نه claim · بدون wipe</p>
          </div>
        </div>

        <div className="min-w-0">
          {display && display.length > 0 ? (
            <>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  جدول سال‌به‌سال · r = <span className="num text-title">{formatRatePercent(effectiveR)}</span>
                  {startYear != null ? (
                    <>
                      {" "}
                      · از <span className="num text-title">{toFa(startYear)}</span>
                    </>
                  ) : null}
                </p>
                {total !== null ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">جمع: </span>
                    <span className="num font-bold text-title">{formatRial(total)}</span>
                    <span className="ms-2 num text-xs text-muted-foreground">
                      ({formatToman(total)})
                    </span>
                  </p>
                ) : null}
              </div>
              <div className="max-h-[28rem] overflow-auto rounded-xl border border-border/70">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="sticky top-0 bg-card/95 p-2 text-start">سال شمسی</th>
                      <th className="sticky top-0 bg-card/95 p-2 text-start">n</th>
                      <th className="sticky top-0 bg-card/95 p-2 text-start">حق‌بیمه (ریال)</th>
                      <th className="sticky top-0 bg-card/95 p-2 text-start">حق‌بیمه (تومان)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {display.map((row) => {
                      const is1405 = row.jalaliYear === DIYA_DEFAULT_YEAR;
                      return (
                        <tr
                          key={row.year}
                          className={
                            is1405
                              ? "border-b border-border/50 bg-[color-mix(in_srgb,var(--brand-emerald)_12%,transparent)]"
                              : "border-b border-border/50"
                          }
                        >
                          <td className="num p-2 font-medium text-title">
                            {toFa(row.jalaliYear)}
                            {is1405 ? (
                              <span className="ms-2 text-[10px] text-[var(--brand-emerald)]">
                                حق‌بیمه محاسبه‌شده سال ۱۴۰۵
                              </span>
                            ) : null}
                          </td>
                          <td className="num p-2 text-muted-foreground">{toFa(row.year)}</td>
                          <td className="num p-2 font-medium text-title">{formatNumber(row.premiumRial)}</td>
                          <td className="num p-2 text-muted-foreground">{formatNumber(row.premiumToman)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[12rem] items-center justify-center rounded-xl border border-dashed border-border/80 px-4 text-center text-sm text-muted-foreground">
              P₀ (حق بیمه اولیه)، نرخ و تعداد سال را وارد کنید؛ جدول سال‌به‌سال اینجا می‌آید.
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
