import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Shield } from "lucide-react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";
import { formatNumber, toFa } from "@/lib/format";
import {
  DEMO_DISCLAIMER,
  MODULE_LABEL,
  SOURCE_BIMEBAZAR,
  SOURCE_LABEL_BIMEBAZAR,
  VEHICLE_INQUIRY_LABEL_FA,
  assignUniqueCode,
  enqueueExport,
  fetchDeathCeiling,
  fetchExportQueue,
  fetchSanhabMeta,
  fetchUniqueCode,
  isValidUniqueCode,
  kindLabel,
  postDeathInquiry,
  postVehicleInquiry,
  putDeathCeiling,
  runExport,
  type DeathInquiry,
  type ExportQueueItem,
  type LiveVehicleResult,
} from "@/lib/sanhab";
import {
  EMPTY_PLATE,
  PLATE_LETTERS,
  formatPlate,
  isCompletePlate,
  isValidNationalId,
  type IranianPlate,
} from "@/lib/premium-compare-mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sanhab")({
  head: () => ({
    meta: [
      { title: `${MODULE_LABEL} | ${BRAND.title}` },
      {
        name: "description",
        content: "سنهاب — استعلام از طریق بیمه‌بازار، تجمیع فوت، کد یکتا، صف ارسال.",
      },
    ],
  }),
  component: SanhabPage,
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

function SanhabPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ceiling, setCeiling] = useState<number>(50_000_000_000);
  const [queuedCount, setQueuedCount] = useState(0);
  const [queue, setQueue] = useState<ExportQueueItem[]>([]);

  // Death inquiry form
  const [nid, setNid] = useState("0076543210");
  const [proposed, setProposed] = useState("5000000000");
  const [manualSum, setManualSum] = useState("");
  const [deathResult, setDeathResult] = useState<DeathInquiry | null>(null);

  // Vehicle live (BimeBazar) + unique code (DEMO local)
  const [plate, setPlate] = useState<IranianPlate>({ ...EMPTY_PLATE });
  const [vehicleNid, setVehicleNid] = useState("");
  const [vin, setVin] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [computerCode, setComputerCode] = useState("");
  const [vehicleResult, setVehicleResult] = useState<LiveVehicleResult | null>(null);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [uniqueCode, setUniqueCode] = useState<string | null>(null);

  // Export enqueue form
  const [expKind, setExpKind] = useState<"issuance" | "endorsement" | "financial_tx">("issuance");
  const [lastBatchPath, setLastBatchPath] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meta, ceil, q] = await Promise.all([
        fetchSanhabMeta(),
        fetchDeathCeiling(),
        fetchExportQueue(),
      ]);
      if (!meta.ok) throw new Error("meta failed");
      if (ceil.config?.ceilingRial != null) setCeiling(ceil.config.ceilingRial);
      setQueue(q.items || []);
      setQueuedCount(q.queuedCount ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در بارگذاری سنهاب");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onDeathInquiry() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const body: {
        nationalId: string;
        proposedCapital?: number;
        manualKnownSum?: number;
      } = {
        nationalId: nid.trim(),
        proposedCapital: Number(proposed) || 0,
      };
      if (manualSum.trim()) body.manualKnownSum = Number(manualSum);
      const r = await postDeathInquiry(body);
      if (!r.ok || !r.inquiry) throw new Error(r.error || "استعلام فوت ناموفق");
      setDeathResult(r.inquiry);
      setMsg(
        r.overLimit
          ? "هشدار: تجمیع سرمایه فوت از سقف صنعت فراتر است"
          : "استعلام فوت در محدوده مجاز سقف صنعت",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveCeiling() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await putDeathCeiling(ceiling);
      if (!r.ok) throw new Error(r.error || "ذخیره سقف ناموفق");
      setMsg(`سقف صنعت به‌روز شد: ${formatNumber(ceiling)} ریال`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  async function onVehicleInquiry() {
    setBusy(true);
    setMsg(null);
    setError(null);
    setVehicleError(null);
    setVehicleResult(null);
    try {
      if (!isCompletePlate(plate)) {
        throw new Error("پلاک کامل ۴ تکه لازم است (۲ رقم + حرف + ۳ رقم + کد ایران)");
      }
      if (!isValidNationalId(vehicleNid)) {
        throw new Error(
          vehicleNid.replace(/\D/g, "").length === 10
            ? "کد ملی نامعتبر است (checksum)"
            : "کد ملی باید ۱۰ رقم باشد",
        );
      }
      const r = await postVehicleInquiry({
        plate: {
          platePart1: plate.platePart1,
          plateLetter: plate.plateLetter,
          platePart2: plate.platePart2,
          plateIranCode: plate.plateIranCode,
        },
        nationalId: vehicleNid.replace(/\D/g, ""),
      });
      setVehicleResult(r);
      if (!r.ok) {
        const err = r.userMessage || r.error || "استعلام از طریق بیمه‌بازار ناموفق بود";
        setVehicleError(err);
        // Never promote DEMO stub as live on failure
        if (r.demoStub) {
          setVehicleError("پاسخ DEMO به‌عنوان زنده پذیرفته نشد — دوباره تلاش کنید");
        }
        return;
      }
      if (r.demoStub) {
        setVehicleError("پاسخ DEMO — داده زنده نیست");
        return;
      }
      setMsg(r.userMessage || "استعلام از طریق بیمه‌بازار انجام شد");
    } catch (e) {
      setVehicleError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  function digitsOnly(value: string, max: number): string {
    return value.replace(/\D/g, "").slice(0, max);
  }

  async function onAssignCode() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await assignUniqueCode({
        policyNumber: policyNumber.trim(),
        computerCode: computerCode.trim() || undefined,
        plate: formatPlate(plate) || undefined,
        vin: vin.trim() || undefined,
      });
      if (!r.ok || !r.uniqueCode) throw new Error(r.error || "تخصیص کد یکتا ناموفق");
      setUniqueCode(r.uniqueCode);
      setMsg(r.assigned ? `کد یکتا تخصیص یافت: ${r.uniqueCode}` : r.message || "کد موجود");
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  async function onLookupCode() {
    setBusy(true);
    try {
      const r = await fetchUniqueCode(policyNumber.trim(), computerCode.trim() || undefined);
      if (!r.ok) throw new Error(r.error || "جستجو ناموفق");
      setUniqueCode(r.found ? r.uniqueCode || null : null);
      setMsg(r.found ? `کد یکتا: ${r.uniqueCode}` : "کد یکتا برای این بیمه‌نامه یافت نشد");
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  async function onEnqueue() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await enqueueExport({
        kind: expKind,
        payload: {
          policyNumber: policyNumber.trim(),
          computerCode: computerCode.trim() || undefined,
          uniqueCode: uniqueCode || undefined,
          demo: true,
        },
      });
      if (!r.ok) throw new Error(r.error || "ورود به صف ناموفق");
      setMsg(`به صف اضافه شد (#${r.item?.id}) — ${kindLabel(expKind)}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  async function onRunExport() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await runExport();
      if (!r.ok) throw new Error(r.error || "خروجی ناموفق");
      if (r.batch) {
        setLastBatchPath(r.batch.jsonPath);
        setMsg(`خروجی ${toFa(String(r.exported))} رکورد — ${r.batch.batchCode}`);
      } else {
        setMsg(r.message || "صف خالی");
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={MODULE_LABEL} subtitle="استعلام از طریق بیمه‌بازار · تجمیع فوت · کد یکتا · صف ارسال">
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

        <div className="grid gap-3 sm:grid-cols-3">
          <FlatKpi
            label="سقف صنعت (ریال)"
            value={loading ? "…" : toFa(formatNumber(ceiling))}
            hint="قابل تنظیم DEMO"
          />
          <FlatKpi
            label="صف ارسال"
            value={loading ? "…" : toFa(String(queuedCount))}
            hint="issuance / endorsement / financial_tx"
          />
          <FlatKpi
            label="کد یکتا"
            value={uniqueCode && isValidUniqueCode(uniqueCode) ? uniqueCode : "—"}
            hint="قالب SNH-YYYYMMDD-XXXXXXXX"
          />
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw className="ms-1 size-4" />
            تازه‌سازی
          </Button>
        </div>

        <SectionCard title="سقف تجمیع سرمایه فوت" description="پیکربندی سقف صنعت (DEMO)">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
            <div>
              <Label htmlFor="ceiling">سقف (ریال)</Label>
              <Input
                id="ceiling"
                className={FIELD}
                value={String(ceiling)}
                onChange={(e) => setCeiling(Number(e.target.value) || 0)}
                inputMode="numeric"
              />
            </div>
            <Button type="button" onClick={() => void onSaveCeiling()} disabled={busy}>
              ذخیره سقف
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="استعلام تجمیع سرمایه فوت" description="کد ملی → جمع صنعت در برابر سقف">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="nid">کد ملی</Label>
              <Input id="nid" className={FIELD} value={nid} onChange={(e) => setNid(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="proposed">سرمایه پیشنهادی (ریال)</Label>
              <Input
                id="proposed"
                className={FIELD}
                value={proposed}
                onChange={(e) => setProposed(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div>
              <Label htmlFor="manual">مجموع دستی (اختیاری DEMO)</Label>
              <Input
                id="manual"
                className={FIELD}
                value={manualSum}
                onChange={(e) => setManualSum(e.target.value)}
                placeholder="override known sum"
                inputMode="numeric"
              />
            </div>
          </div>
          <div className="mt-3">
            <Button type="button" onClick={() => void onDeathInquiry()} disabled={busy}>
              استعلام فوت
            </Button>
          </div>
          {deathResult && (
            <div className="mt-4 grid gap-2 rounded-xl border border-border/60 p-3 text-sm sm:grid-cols-2">
              <p>
                مجموع شناخته‌شده:{" "}
                <span className="num font-bold">{toFa(formatNumber(deathResult.knownSumRial))}</span>
              </p>
              <p>
                پس از پیشنهاد:{" "}
                <span className="num font-bold">{toFa(formatNumber(deathResult.totalAfterRial))}</span>
              </p>
              <p>
                سقف: <span className="num">{toFa(formatNumber(deathResult.ceilingRial))}</span>
              </p>
              <p className={deathResult.overLimit ? "font-bold text-destructive" : "text-emerald-700"}>
                {deathResult.overLimit
                  ? `فراتر از سقف — مازاد ${toFa(formatNumber(deathResult.excessRial))}`
                  : `مجاز — مانده سقف ${toFa(formatNumber(deathResult.headroomRial))}`}
              </p>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={VEHICLE_INQUIRY_LABEL_FA}
          description="پلاک ۴ تکه + کد ملی · منبع شرکای بیمه‌بازار — نه سنهاب رسمی بیمه مرکزی"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-emerald-600/40 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-800 dark:text-emerald-100">
              {SOURCE_LABEL_BIMEBAZAR} · {SOURCE_BIMEBAZAR}
            </span>
            <span className="text-muted-foreground">بدون ذخیره کد ملی / پلاک در پایگاه</span>
          </div>

          <div className="space-y-1.5 rounded-xl border border-border/70 bg-card/40 p-3">
            <Label className="text-sm text-muted-foreground">
              پلاک ایرانی <span className="text-destructive">*</span>
            </Label>
            <div className="flex flex-wrap items-center gap-2" dir="rtl" aria-label="پلاک خودرو">
              <Input
                value={plate.platePart1}
                onChange={(e) => setPlate({ ...plate, platePart1: digitsOnly(e.target.value, 2) })}
                inputMode="numeric"
                maxLength={2}
                placeholder="۱۲"
                className={cn(FIELD, "w-16 num")}
                aria-label="دو رقم اول پلاک"
              />
              <span className="text-muted-foreground" aria-hidden>
                |
              </span>
              <select
                className={cn(FIELD, "w-20 sm:w-24")}
                value={plate.plateLetter}
                onChange={(e) =>
                  setPlate({
                    ...plate,
                    plateLetter: e.target.value as IranianPlate["plateLetter"],
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
                onChange={(e) => setPlate({ ...plate, platePart2: digitsOnly(e.target.value, 3) })}
                inputMode="numeric"
                maxLength={3}
                placeholder="۳۴۵"
                className={cn(FIELD, "w-20 num sm:w-24")}
                aria-label="سه رقم میانی پلاک"
              />
              <span className="text-sm font-medium text-muted-foreground">ایران</span>
              <Input
                value={plate.plateIranCode}
                onChange={(e) =>
                  setPlate({ ...plate, plateIranCode: digitsOnly(e.target.value, 2) })
                }
                inputMode="numeric"
                maxLength={2}
                placeholder="۱۱"
                className={cn(FIELD, "w-16 num")}
                aria-label="کد ایران"
              />
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="vehicle-nid">
                کد ملی <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vehicle-nid"
                className={cn(FIELD, "num")}
                value={vehicleNid}
                onChange={(e) => setVehicleNid(digitsOnly(e.target.value, 10))}
                inputMode="numeric"
                maxLength={10}
                placeholder="۱۰ رقم"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onVehicleInquiry()} disabled={busy}>
              {VEHICLE_INQUIRY_LABEL_FA}
            </Button>
            {vehicleError && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void onVehicleInquiry()}
                disabled={busy}
              >
                <RefreshCw className="ms-1 size-4" />
                تلاش دوباره
              </Button>
            )}
          </div>

          {vehicleError && (
            <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {vehicleError}
            </div>
          )}

          {vehicleResult && vehicleResult.ok && !vehicleResult.demoStub && (
            <div className="mt-4 space-y-3 rounded-xl border border-border/60 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-600/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium">
                  منبع: {vehicleResult.sourceLabel || SOURCE_LABEL_BIMEBAZAR} ·{" "}
                  {vehicleResult.source || SOURCE_BIMEBAZAR}
                </span>
                <span className="text-xs text-muted-foreground">
                  وضعیت: {vehicleResult.lookupStatus || "matched"}
                </span>
                {vehicleResult.sourceTimestamp && (
                  <span className="text-xs text-muted-foreground num" dir="ltr">
                    {vehicleResult.sourceTimestamp}
                  </span>
                )}
              </div>
              {vehicleResult.query && (
                <div className="grid gap-1 sm:grid-cols-2 text-muted-foreground">
                  {vehicleResult.query.plateDisplay && (
                    <p>
                      پلاک:{" "}
                      <span className="num text-foreground">{vehicleResult.query.plateDisplay}</span>
                    </p>
                  )}
                  {vehicleResult.query.nationalIdMasked && (
                    <p>
                      کد ملی:{" "}
                      <span className="num text-foreground">
                        {vehicleResult.query.nationalIdMasked}
                      </span>
                    </p>
                  )}
                </div>
              )}
              {/* Only render fields actually returned — no fake address/phone/insurer fixtures */}
              {vehicleResult.owner && (
                <div className="rounded-lg border border-border/40 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">مالک</p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {vehicleResult.owner.name && <p>نام: {vehicleResult.owner.name}</p>}
                    {vehicleResult.owner.nationalIdMasked && (
                      <p>
                        کد ملی:{" "}
                        <span className="num">{vehicleResult.owner.nationalIdMasked}</span>
                      </p>
                    )}
                    {vehicleResult.owner.address && <p>آدرس: {vehicleResult.owner.address}</p>}
                    {vehicleResult.owner.phone && (
                      <p>
                        تلفن: <span className="num">{vehicleResult.owner.phone}</span>
                      </p>
                    )}
                    {!vehicleResult.owner.name &&
                      !vehicleResult.owner.address &&
                      !vehicleResult.owner.phone && (
                        <p className="text-muted-foreground">
                          فیلد مالک در پاسخ شرکا موجود نبود
                        </p>
                      )}
                  </div>
                </div>
              )}
              {vehicleResult.vehicle && (
                <div className="rounded-lg border border-border/40 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">خودرو</p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {vehicleResult.vehicle.make && <p>برند: {vehicleResult.vehicle.make}</p>}
                    {vehicleResult.vehicle.model && <p>مدل: {vehicleResult.vehicle.model}</p>}
                    {vehicleResult.vehicle.vin && (
                      <p>
                        VIN: <span className="num">{vehicleResult.vehicle.vin}</span>
                      </p>
                    )}
                    {vehicleResult.vehicle.year && (
                      <p>
                        سال: <span className="num">{vehicleResult.vehicle.year}</span>
                      </p>
                    )}
                    {vehicleResult.vehicle.usage && <p>کاربری: {vehicleResult.vehicle.usage}</p>}
                  </div>
                </div>
              )}
              {vehicleResult.policy && (
                <div className="rounded-lg border border-border/40 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">بیمه‌نامه</p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {vehicleResult.policy.insurerCompany && (
                      <p>شرکت: {vehicleResult.policy.insurerCompany}</p>
                    )}
                    {vehicleResult.policy.branch && <p>شعبه: {vehicleResult.policy.branch}</p>}
                    {vehicleResult.policy.branchAddress && (
                      <p>آدرس شعبه: {vehicleResult.policy.branchAddress}</p>
                    )}
                    {vehicleResult.policy.number && (
                      <p>
                        شماره: <span className="num">{vehicleResult.policy.number}</span>
                      </p>
                    )}
                    {vehicleResult.policy.status && <p>وضعیت: {vehicleResult.policy.status}</p>}
                    {vehicleResult.policy.start && (
                      <p>
                        شروع: <span className="num">{vehicleResult.policy.start}</span>
                      </p>
                    )}
                    {vehicleResult.policy.end && (
                      <p>
                        پایان: <span className="num">{vehicleResult.policy.end}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
              {vehicleResult.partnerMeta && (
                <div className="rounded-lg border border-border/40 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">متادیتای شرکا</p>
                  <div className="grid gap-1 sm:grid-cols-2 text-xs">
                    {Object.entries(vehicleResult.partnerMeta).map(([k, v]) => (
                      <p key={k}>
                        {k}: <span className="num">{v}</span>
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {(!vehicleResult.owner ||
                (!vehicleResult.owner.name &&
                  !vehicleResult.owner.address &&
                  !vehicleResult.owner.phone)) &&
                !vehicleResult.vehicle &&
                !vehicleResult.policy && (
                  <p className="text-muted-foreground">
                    استعلام موفق بود اما فیلدهای مالک/آدرس/تلفن/مکان بیمه‌گر در پاسخ شرکا نبود —
                    چیزی جعل نشده است.
                  </p>
                )}
              {vehicleResult.availableFields && vehicleResult.availableFields.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  فیلدهای موجود: {vehicleResult.availableFields.join(" · ")}
                </p>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="کد یکتا + پیوند محلی (DEMO)"
          description="تخصیص کد یکتا روی بیمه‌نامه محلی — stub بدون شبکه رسمی"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pol">شماره بیمه‌نامه</Label>
              <Input
                id="pol"
                className={FIELD}
                value={policyNumber}
                onChange={(e) => setPolicyNumber(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cc">کد رایانه</Label>
              <Input
                id="cc"
                className={FIELD}
                value={computerCode}
                onChange={(e) => setComputerCode(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="vin">VIN (اختیاری DEMO)</Label>
              <Input id="vin" className={FIELD} value={vin} onChange={(e) => setVin(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onAssignCode()} disabled={busy}>
              تخصیص کد یکتا
            </Button>
            <Button type="button" variant="outline" onClick={() => void onLookupCode()} disabled={busy}>
              جستجوی کد
            </Button>
          </div>
          {uniqueCode && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/60 bg-card p-3 text-sm">
              <Shield className="size-4 shrink-0 text-emerald-600" />
              <span>
                کد یکتا: <span className="num font-extrabold tracking-wide">{uniqueCode}</span>
                {isValidUniqueCode(uniqueCode) ? " ✓" : " (نامعتبر)"}
              </span>
            </div>
          )}
        </SectionCard>

        <SectionCard title="صف ارسال تراکنش / الحاقیه" description="بدون تماس شبکه — خروجی JSON/CSV stub">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="ekind">نوع</Label>
              <select
                id="ekind"
                className={FIELD}
                value={expKind}
                onChange={(e) => setExpKind(e.target.value as typeof expKind)}
              >
                <option value="issuance">صدور</option>
                <option value="endorsement">الحاقیه</option>
                <option value="financial_tx">تراکنش مالی</option>
              </select>
            </div>
            <Button type="button" onClick={() => void onEnqueue()} disabled={busy}>
              افزودن به صف
            </Button>
            <Button type="button" onClick={() => void onRunExport()} disabled={busy || queuedCount === 0}>
              اجرای خروجی
            </Button>
          </div>
          {lastBatchPath && (
            <p className="mt-2 text-xs text-muted-foreground dir-ltr text-left">
              batch: <span className="num">{lastBatchPath}</span>
            </p>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="px-2 py-2 text-right font-medium">#</th>
                  <th className="px-2 py-2 text-right font-medium">نوع</th>
                  <th className="px-2 py-2 text-right font-medium">بیمه‌نامه</th>
                  <th className="px-2 py-2 text-right font-medium">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {queue.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">
                      صف خالی است
                    </td>
                  </tr>
                )}
                {queue.map((row) => (
                  <tr key={row.id} className="border-b border-border/40">
                    <td className="px-2 py-2 num">{toFa(String(row.id))}</td>
                    <td className="px-2 py-2">{kindLabel(String(row.kind))}</td>
                    <td className="px-2 py-2 num">{row.policyNumber || "—"}</td>
                    <td className="px-2 py-2">{row.status === "queued" ? "در صف" : row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <p className="pb-6 text-xs text-muted-foreground">
          مسیر منو: سایر ← سنهاب · API: <span className="num">/api/sanhab/*</span> · استعلام خودرو از
          طریق بیمه‌بازار · Eng-only این بچ اکسل · M1–M4 حفظ
        </p>
      </div>
    </AppShell>
  );
}
