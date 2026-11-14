import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Calculator, Car, MessageSquareText, RefreshCw, Shield, Sparkles } from "lucide-react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";
import { formatNumber, toFa } from "@/lib/format";
import {
  BIMEBAZAR_CATEGORY_LABELS,
  BIMEBAZAR_SOURCE_CHIP_FA,
  DEFAULT_VEHICLE_INPUTS,
  FINANCIAL_COVER_TOMAN,
  MISSING_FIELD_LABELS,
  OTHER_DISCOVER_STUB_FA,
  PLATE_LETTERS,
  buildMockCompareRows,
  categoryToPremiumLine,
  collectMissingFields,
  formatOfferDiscounts,
  formatPlate,
  formatSolvencyLevel,
  isCompletePlate,
  isValidNationalId,
  premiumCompareSource,
  sortByTotal,
  type BimeBazarCategory,
  type InsurerCompareRow,
  type MissingFieldKey,
  type PremiumLine,
  type VehicleInputs,
} from "@/lib/premium-compare-mock";
import {
  requestPremiumCompare,
  type PremiumCompareResult,
} from "@/lib/premium-compare-api";
import {
  askPremiumAdvisor,
  fetchPremiumAiStatus,
  type AdvisorReply,
} from "@/lib/premium-ai-advisor";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/premium-calc")({
  head: () => ({
    meta: [
      { title: `بیمه‌بازار | ${BRAND.title}` },
      {
        name: "description",
        content: "هاب دسته‌بندی بیمه‌بازار — ثالث و بدنه لایو از پنل شرکا.",
      },
    ],
  }),
  component: PremiumCalcPage,
});

const FIELD_SELECT =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const PLATE_DIGIT =
  "h-11 w-14 rounded-md border border-input bg-card px-2 text-center text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-16";

const HUB_CATEGORIES: {
  id: BimeBazarCategory;
  title: string;
  blurb: string;
  live: boolean;
  icon: typeof Car;
}[] = [
  {
    id: "third_party",
    title: BIMEBAZAR_CATEGORY_LABELS.third_party,
    blurb: "استعلام لایو شرکا · پوشش مالی ۷۰M–۱B",
    live: true,
    icon: Shield,
  },
  {
    id: "car_body",
    title: BIMEBAZAR_CATEGORY_LABELS.car_body,
    blurb: "استعلام لایو شرکا · همه شرکت‌های برگشتی",
    live: true,
    icon: Car,
  },
  {
    id: "other_discover",
    title: BIMEBAZAR_CATEGORY_LABELS.other_discover,
    blurb: OTHER_DISCOVER_STUB_FA,
    live: false,
    icon: Sparkles,
  },
];

function AgencyHeaderLockup() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-2.5 py-1">
      <BrandMark size="sm" className="size-7" alt={`لوگوی ${BRAND.insurer}`} />
      <span className="num text-sm font-extrabold tracking-wide text-title">{BRAND.agencyCode}</span>
    </div>
  );
}

function digitsOnly(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

function Field({
  label,
  children,
  hint,
  error,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-muted-foreground">
        {label}
        {required ? <span className="ms-1 text-destructive">*</span> : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

function PlateFields({
  values,
  onChange,
  highlight,
}: {
  values: VehicleInputs;
  onChange: (patch: Partial<VehicleInputs>) => void;
  highlight?: boolean;
}) {
  const plate = values.plate;
  return (
    <div
      className={cn(
        "space-y-1.5 rounded-xl border border-border/70 bg-card/40 p-3 sm:col-span-2 xl:col-span-3",
        highlight && "border-destructive/60 ring-1 ring-destructive/30",
      )}
    >
      <Label className="text-sm text-muted-foreground">
        پلاک ایرانی <span className="text-destructive">*</span>
      </Label>
      <div className="flex flex-wrap items-center gap-2" dir="rtl" aria-label="پلاک خودرو">
        <Input
          value={plate.platePart1}
          onChange={(e) =>
            onChange({ plate: { ...plate, platePart1: digitsOnly(e.target.value, 2) } })
          }
          inputMode="numeric"
          maxLength={2}
          placeholder="۱۲"
          className={cn(PLATE_DIGIT, "num")}
          aria-label="دو رقم اول پلاک"
        />
        <span className="text-muted-foreground" aria-hidden>
          |
        </span>
        <select
          className={cn(FIELD_SELECT, "h-11 w-20 sm:w-24")}
          value={plate.plateLetter}
          onChange={(e) =>
            onChange({
              plate: { ...plate, plateLetter: e.target.value as typeof plate.plateLetter },
            })
          }
          aria-label="حرف پلاک"
        >
          <option value="">حرف</option>
          {PLATE_LETTERS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground" aria-hidden>
          |
        </span>
        <Input
          value={plate.platePart2}
          onChange={(e) =>
            onChange({ plate: { ...plate, platePart2: digitsOnly(e.target.value, 3) } })
          }
          inputMode="numeric"
          maxLength={3}
          placeholder="۳۴۵"
          className={cn(PLATE_DIGIT, "w-20 num sm:w-24")}
          aria-label="سه رقم میانی پلاک"
        />
        <span className="text-sm font-medium text-muted-foreground">ایران</span>
        <Input
          value={plate.plateIranCode}
          onChange={(e) =>
            onChange({ plate: { ...plate, plateIranCode: digitsOnly(e.target.value, 2) } })
          }
          inputMode="numeric"
          maxLength={2}
          placeholder="۱۱"
          className={cn(PLATE_DIGIT, "num")}
          aria-label="کد ایران"
        />
      </div>
      <p className={cn("text-[11px]", highlight ? "text-destructive" : "text-muted-foreground")}>
        {highlight
          ? "پلاک ۴ تکه کامل لازم است قبل از استعلام (۲ رقم + حرف + ۳ رقم + کد ایران)."
          : `مثال: ${toFa("12")} | ب | ${toFa("345")} | ایران ${toFa("11")} — فیلدهای جدا، نه متن آزاد`}
      </p>
    </div>
  );
}

function VehicleFormFields({
  line,
  values,
  onChange,
  missing,
}: {
  line: PremiumLine;
  values: VehicleInputs;
  onChange: (patch: Partial<VehicleInputs>) => void;
  missing: MissingFieldKey[];
}) {
  const miss = (k: MissingFieldKey) => missing.includes(k);
  const nidTouched = values.nationalId.length > 0;
  const nidError =
    nidTouched && !isValidNationalId(values.nationalId)
      ? values.nationalId.replace(/\D/g, "").length === 10
        ? "کد ملی نامعتبر است (checksum)"
        : "کد ملی باید ۱۰ رقم باشد"
      : miss("nationalId")
        ? "کد ملی را وارد کنید"
        : undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <PlateFields values={values} onChange={onChange} highlight={miss("plate")} />

      <Field label="کد ملی" required error={nidError}>
        <Input
          value={values.nationalId}
          onChange={(e) => onChange({ nationalId: digitsOnly(e.target.value, 10) })}
          inputMode="numeric"
          maxLength={10}
          placeholder="۱۰ رقم"
          className={cn("num", miss("nationalId") && "border-destructive")}
          aria-label="کد ملی"
          aria-invalid={Boolean(nidError)}
        />
      </Field>

      {line === "third_party" ? (
        <Field
          label="پوشش مالی ثالث (تومان)"
          required
          error={miss("financialCover") ? "پوشش مالی را انتخاب کنید — بدون پیش‌فرض خاموش" : undefined}
        >
          <select
            className={cn(FIELD_SELECT, miss("financialCover") && "border-destructive")}
            value={values.financialCover ?? ""}
            onChange={(e) =>
              onChange({
                financialCover: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            aria-label="پوشش مالی ثالث"
          >
            <option value="">انتخاب کنید…</option>
            {FINANCIAL_COVER_TOMAN.map((n) => (
              <option key={n} value={n}>
                {formatNumber(n)} تومان
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field
        label="سال ساخت (شمسی)"
        required
        error={miss("year") ? "سال ساخت را وارد کنید" : undefined}
      >
        <Input
          value={values.year}
          onChange={(e) => onChange({ year: digitsOnly(e.target.value, 4) })}
          inputMode="numeric"
          maxLength={4}
          placeholder="مثلاً ۱۴۰۲"
          className={cn("num", miss("year") && "border-destructive")}
          aria-label="سال ساخت"
        />
      </Field>

      <Field label="کاربری" required error={miss("usage") ? "کاربری را انتخاب کنید" : undefined}>
        <select
          className={cn(FIELD_SELECT, miss("usage") && "border-destructive")}
          value={values.usage}
          onChange={(e) => onChange({ usage: e.target.value })}
          aria-label="کاربری"
        >
          <option value="">انتخاب کنید…</option>
          {["شخصی", "تاکسی", "آژانس", "سایر"].map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="نوع وسیله"
        required
        error={miss("vehicleType") ? "نوع وسیله را انتخاب کنید" : undefined}
      >
        <select
          className={cn(FIELD_SELECT, miss("vehicleType") && "border-destructive")}
          value={values.vehicleType}
          onChange={(e) => onChange({ vehicleType: e.target.value })}
          aria-label="نوع وسیله"
        >
          <option value="">انتخاب کنید…</option>
          {["سواری", "وانت", "موتورسیکلت", "اتوبوس"].map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>

      <Field label="ظرفیت / سیلندر">
        <Input
          value={values.capacity}
          onChange={(e) => onChange({ capacity: e.target.value })}
          placeholder="مثلاً ۴ سیلندر"
          aria-label="ظرفیت"
        />
      </Field>

      <Field label="سابقه عدم خسارت (سال)">
        <Input
          value={values.noClaimYears}
          onChange={(e) => onChange({ noClaimYears: digitsOnly(e.target.value, 2) })}
          inputMode="numeric"
          className="num"
          aria-label="سابقه عدم خسارت"
        />
      </Field>

      <Field label="شهر / منطقه">
        <Input
          value={values.city}
          onChange={(e) => onChange({ city: e.target.value })}
          placeholder="تهران"
          aria-label="شهر"
        />
      </Field>
    </div>
  );
}

function PartnersSourceChip() {
  return (
    <span
      className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 font-medium text-sky-900 dark:text-sky-100"
      title="مسیر partners — نه API رسمی عمومی بیمه‌بازار و نه سنهاب رسمی"
    >
      {BIMEBAZAR_SOURCE_CHIP_FA}
    </span>
  );
}

function SourceStatusChips({
  mode,
  configured,
  sanhabFailed,
  liveOfferCount,
}: {
  mode: "live" | "mock";
  configured: boolean;
  sanhabFailed: boolean;
  liveOfferCount: number;
}) {
  const statusLabel =
    mode === "mock"
      ? "وضعیت: دمو (mock)"
      : configured
        ? `وضعیت لایو · ${toFa(liveOfferCount)} پیشنهاد`
        : "وضعیت: پیکربندی نشده";
  const sanhabLabel = sanhabFailed
    ? "سنهاب شرکا: ناموفق"
    : mode === "live" && configured && liveOfferCount > 0
      ? "سنهاب شرکا: OK"
      : "سنهاب شرکا: —";
  return (
    <div className="mb-2 flex flex-wrap gap-2 text-xs" role="status">
      <PartnersSourceChip />
      <span
        className={cn(
          "rounded-full border px-2.5 py-0.5 font-medium",
          mode === "live" && configured
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
            : mode === "mock"
              ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"
              : "border-destructive/40 bg-destructive/5 text-destructive",
        )}
      >
        {statusLabel}
      </span>
      <span
        className={cn(
          "rounded-full border px-2.5 py-0.5 font-medium",
          sanhabFailed
            ? "border-destructive/40 bg-destructive/5 text-destructive"
            : liveOfferCount > 0 && mode === "live"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "border-border bg-muted/40 text-muted-foreground",
        )}
      >
        {sanhabLabel}
      </span>
    </div>
  );
}

function CompareTable({
  category,
  rows,
  mode,
  error,
  configured,
  sanhabFailed,
  liveOfferCount,
  onRetry,
}: {
  category: BimeBazarCategory;
  rows: InsurerCompareRow[];
  mode: "live" | "mock";
  error?: string;
  configured: boolean;
  sanhabFailed: boolean;
  liveOfferCount: number;
  onRetry?: () => void;
}) {
  const visible = rows;
  const cheapest = visible[0]?.id;
  const catLabel = BIMEBAZAR_CATEGORY_LABELS[category];

  return (
    <div className="overflow-x-auto">
      <SourceStatusChips
        mode={mode}
        configured={configured}
        sanhabFailed={sanhabFailed}
        liveOfferCount={liveOfferCount}
      />
      <p className="mb-2 text-xs text-muted-foreground">
        {toFa(visible.length)} شرکت (نمایش کامل — بدون برش) · دسته: {catLabel} ·{" "}
        {mode === "live" ? "لایو شرکا" : "دمو (mock)"}
      </p>
      {error ? (
        <div
          className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          <p className="flex-1">{error}</p>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
              <RefreshCw className="size-3.5" aria-hidden />
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
      <table className="w-full min-w-[720px] text-base">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="p-2 text-start">شرکت</th>
            <th className="p-2 text-start">تعرفه</th>
            <th className="p-2 text-start">پایه</th>
            <th className="p-2 text-start">تخفیف</th>
            <th className="p-2 text-start">توانگری</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td className="p-3 text-muted-foreground" colSpan={5}>
                پیشنهادی برای نمایش نیست
              </td>
            </tr>
          ) : null}
          {visible.map((q) => {
            const tariff =
              q.tariff ??
              (category === "third_party" ? q.thirdParty : q.body) ??
              null;
            const base = q.baseTariff ?? null;
            return (
              <tr
                key={q.id}
                className={cn("border-b border-border/50", q.id === cheapest && "bg-primary/5")}
              >
                <td className="p-2 font-medium">
                  {q.name}
                  {q.id === cheapest ? (
                    <span className="ms-2 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      ارزان‌ترین
                    </span>
                  ) : null}
                </td>
                <td className="num p-2 font-bold text-title">
                  {tariff != null ? formatNumber(tariff) : "—"}
                </td>
                <td className="num p-2">{base != null ? formatNumber(base) : "—"}</td>
                <td className="p-2 text-sm">{formatOfferDiscounts(q.discounts)}</td>
                <td className="num p-2">{formatSolvencyLevel(q.solvencyLevel)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MissingFieldsBanner({ missing }: { missing: MissingFieldKey[] }) {
  if (missing.length === 0) return null;
  return (
    <div
      className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
      role="alert"
    >
      <p className="font-semibold text-destructive">فیلدهای لازم را تکمیل کنید (بدون پیش‌فرض خاموش):</p>
      <ul className="mt-1 list-inside list-disc text-muted-foreground">
        {missing.map((k) => (
          <li key={k}>{MISSING_FIELD_LABELS[k]}</li>
        ))}
      </ul>
    </div>
  );
}

function AdvisorPanel({
  line,
  inputs,
  showTable,
  rows,
}: {
  line: PremiumLine;
  inputs: VehicleInputs;
  showTable: boolean;
  rows?: InsurerCompareRow[];
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<AdvisorReply | null>(null);
  const [statusLabel, setStatusLabel] = useState<string>("…");

  useEffect(() => {
    let cancelled = false;
    void fetchPremiumAiStatus().then((st) => {
      if (!cancelled) {
        setStatusLabel(st.modelLabel || (st.configured ? st.model : "mock") || "mock");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const runAdvisor = async () => {
    setBusy(true);
    try {
      const advisorRows = showTable
        ? rows && rows.length
          ? rows
          : sortByTotal(buildMockCompareRows(inputs.financialCover))
        : undefined;
      const result = await askPremiumAdvisor({ line, inputs, rows: advisorRows }, question);
      setReply(result);
      if (result.modelLabel) setStatusLabel(result.modelLabel);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="مشاور حق بیمه (AI)"
      description={`سیستم‌پرامپت قفل‌شده · مدل ${statusLabel} · کلید فقط روی سرور (/api/premium-ai)`}
    >
      <div className="space-y-3">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="سؤال اختیاری… مثلاً پوشش مالی مناسب چیست؟ (اگر فیلد ناقص باشد، مشاور می‌پرسد و عدد جعلی نمی‌سازد)"
          className="min-h-[88px] text-base"
          aria-label="سؤال از مشاور"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void runAdvisor()} disabled={busy} className="gap-2">
            <Sparkles className="size-4" aria-hidden />
            {busy ? "در حال مشاوره…" : "مشاوره"}
          </Button>
          <p className="text-xs text-muted-foreground">
            <MessageSquareText className="me-1 inline size-3.5" aria-hidden />
            بدون کلید → mock · با کلید Gemini روی VPS
          </p>
        </div>
        {reply ? (
          <div
            className="rounded-xl border border-border/70 bg-card/50 px-4 py-3 text-sm leading-7 whitespace-pre-wrap"
            role="status"
          >
            <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
              حالت: {reply.mode === "live" ? "live" : "mock"} · مدل {reply.modelLabel}
              {reply.error ? ` · fallback (${reply.code || reply.error})` : ""}
            </p>
            {reply.content}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function LinePanel({ category }: { category: "third_party" | "car_body" }) {
  const line = categoryToPremiumLine(category)!;
  const [inputs, setInputs] = useState<VehicleInputs>(() => ({ ...DEFAULT_VEHICLE_INPUTS }));
  const [missing, setMissing] = useState<MissingFieldKey[]>([]);
  const [showTable, setShowTable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<InsurerCompareRow[]>([]);
  const initialSource = premiumCompareSource();
  const [mode, setMode] = useState<"live" | "mock">(initialSource === "mock" ? "mock" : "live");
  const [compareError, setCompareError] = useState<string | undefined>(undefined);
  const [configured, setConfigured] = useState(false);
  const [sanhabFailed, setSanhabFailed] = useState(false);
  const [liveOfferCount, setLiveOfferCount] = useState(0);

  const applyResult = (result: PremiumCompareResult) => {
    setRows(result.rows);
    setMode(result.mode);
    setCompareError(result.error);
    setConfigured(result.configured);
    setSanhabFailed(result.sanhabFailed);
    setLiveOfferCount(result.liveOfferCount);
    setShowTable(true);
  };

  const patch = (p: Partial<VehicleInputs>) => {
    setInputs((prev) => ({ ...prev, ...p }));
    setShowTable(false);
    setMissing([]);
    setCompareError(undefined);
    setSanhabFailed(false);
  };

  const runCompare = async () => {
    const miss = collectMissingFields(line, inputs);
    setMissing(miss);
    if (miss.length > 0) {
      setShowTable(false);
      return;
    }
    if (!isCompletePlate(inputs.plate)) {
      setMissing((m) => (m.includes("plate") ? m : ["plate", ...m]));
      setShowTable(false);
      return;
    }
    setBusy(true);
    setCompareError(undefined);
    try {
      const result = await requestPremiumCompare(line, inputs);
      applyResult(result);
    } finally {
      setBusy(false);
    }
  };

  const companyCountLabel =
    mode === "mock"
      ? `${toFa(rows.length)} شرکت (دمو)`
      : `${toFa(liveOfferCount)} پیشنهاد لایو`;

  return (
    <div className="space-y-4">
      <SectionCard
        title={`مشخصات وسیله — ${BIMEBAZAR_CATEGORY_LABELS[category]}`}
        description="پلاک ۴ تکه کامل قبل از استعلام · کد ملی checksum · قیمت از پنل شرکای بیمه‌بازار."
      >
        <div className="mb-3">
          <PartnersSourceChip />
        </div>
        <VehicleFormFields line={line} values={inputs} onChange={patch} missing={missing} />
        <MissingFieldsBanner missing={missing} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void runCompare()} disabled={busy} className="gap-2">
            <Calculator className="size-4" aria-hidden />
            {busy ? "در حال استعلام…" : "محاسبه و مقایسه"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setInputs({ ...DEFAULT_VEHICLE_INPUTS });
              setMissing([]);
              setShowTable(false);
              setRows([]);
              setCompareError(undefined);
              setConfigured(false);
              setSanhabFailed(false);
              setLiveOfferCount(0);
              setMode(premiumCompareSource() === "mock" ? "mock" : "live");
            }}
            className="gap-2"
          >
            <RefreshCw className="size-4" aria-hidden />
            بازنشانی
          </Button>
          <p className="text-xs text-muted-foreground">
            {companyCountLabel} · {formatPlate(inputs.plate) || "پلاک ناقص — استعلام غیرفعال"}
          </p>
        </div>
        {showTable ? (
          <div className="mt-3">
            <SourceStatusChips
              mode={mode}
              configured={configured}
              sanhabFailed={sanhabFailed}
              liveOfferCount={liveOfferCount}
            />
          </div>
        ) : null}
      </SectionCard>

      {showTable ? (
        <SectionCard
          title="جدول پیشنهاد شرکا"
          description="ستون‌ها: شرکت · تعرفه · پایه · تخفیف · توانگری — همه ردیف‌ها (بدون برش)"
        >
          <CompareTable
            category={category}
            rows={rows}
            mode={mode}
            error={compareError}
            configured={configured}
            sanhabFailed={sanhabFailed}
            liveOfferCount={liveOfferCount}
            onRetry={
              compareError && mode === "live" ? () => void runCompare() : undefined
            }
          />
        </SectionCard>
      ) : null}

      <AdvisorPanel line={line} inputs={inputs} showTable={showTable} rows={rows} />
    </div>
  );
}

function OtherDiscoverStub() {
  return (
    <SectionCard
      title={BIMEBAZAR_CATEGORY_LABELS.other_discover}
      description="فقط پس از کشف endpoint واقعی partners توسط وصل‌کن — بدون scrape و بدون تعرفه جعلی."
    >
      <div
        className="rounded-xl border border-dashed border-amber-500/50 bg-amber-500/5 px-4 py-8 text-center"
        role="status"
      >
        <p className="text-lg font-semibold text-title">{OTHER_DISCOVER_STUB_FA}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          عمر / درمان / آتش‌سوزی / مسافرت / مسئولیت / مهندسی — P1 پس از map وصل‌کن.
        </p>
        <div className="mt-4 flex justify-center">
          <PartnersSourceChip />
        </div>
      </div>
    </SectionCard>
  );
}

function CategoryHub({
  active,
  onSelect,
}: {
  active: BimeBazarCategory;
  onSelect: (c: BimeBazarCategory) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3" role="tablist" aria-label="دسته‌های بیمه‌بازار">
      {HUB_CATEGORIES.map((cat) => {
        const Icon = cat.icon;
        const selected = active === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(cat.id)}
            className={cn(
              "rounded-2xl border p-4 text-start transition-colors",
              selected
                ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
                : "border-border/70 bg-card/50 hover:border-primary/40 hover:bg-card",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border",
                  selected
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-muted/40 text-muted-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <div>
                <p className="font-semibold text-title">{cat.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {cat.live ? "لایو" : "stub"} · {cat.id}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{cat.blurb}</p>
          </button>
        );
      })}
    </div>
  );
}

function PremiumCalcPage() {
  const [category, setCategory] = useState<BimeBazarCategory>("third_party");

  return (
    <AppShell
      title="بیمه‌بازار"
      subtitle="هاب دسته · ثالث و بدنه لایو از پنل شرکا"
      permission="tools.view"
      leading={<AgencyHeaderLockup />}
    >
      <div className="space-y-4" dir="rtl">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <PartnersSourceChip />
          <span className="text-muted-foreground">
            mock منبع اولیه نیست · fail → خالی + پیام + Retry
          </span>
        </div>

        <CategoryHub active={category} onSelect={setCategory} />

        {category === "other_discover" ? (
          <OtherDiscoverStub />
        ) : (
          <LinePanel key={category} category={category} />
        )}
      </div>
    </AppShell>
  );
}
