import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, Download, FileUp, RefreshCw, Trash2 } from "lucide-react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";
import { toFa } from "@/lib/format";
import {
  DEMO_DISCLAIMER,
  FILE_CATEGORIES,
  MODULE_LABEL,
  OCR_DOC_TYPES,
  archiveCustomerKey,
  archiveFileUrl,
  assignArchive,
  createDocument,
  fetchDmsMeta,
  fileToBase64,
  kindLabel,
  listArchiveFiles,
  lookupArchive,
  mapOcrFields,
  ocrTypeLabel,
  postOcr,
  signDocument,
  softDeleteArchiveFile,
  uploadArchiveFile,
  type ArchiveLocation,
  type DmsDocument,
  type DurableArchiveFile,
  type OcrDocType,
} from "@/lib/dms";

export const Route = createFileRoute("/dms")({
  head: () => ({
    meta: [
      { title: `${MODULE_LABEL} | ${BRAND.title}` },
      {
        name: "description",
        content: "بایگانی — بارکد زونکن، امضای الکترونیک stub، OCR فارسی stub.",
      },
    ],
  }),
  component: DmsPage,
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

function DmsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Archive form
  const [dossierKey, setDossierKey] = useState("Dossier-DEMO-3045");
  const [branch, setBranch] = useState("3045");
  const [shelf, setShelf] = useState("A1");
  const [row, setRow] = useState("03");
  const [binder, setBinder] = useState("Z12");
  const [lookupQ, setLookupQ] = useState("");
  const [location, setLocation] = useState<ArchiveLocation | null>(null);

  // Document + sign
  const [docDossier, setDocDossier] = useState("Dossier-DEMO-3045");
  const [docKind, setDocKind] = useState("proposal");
  const [document, setDocument] = useState<DmsDocument | null>(null);
  const [signMethod, setSignMethod] = useState<"touch" | "fingerprint">("touch");

  // OCR
  const [ocrType, setOcrType] = useState<OcrDocType>("national_id_card");
  const [stubText, setStubText] = useState("");
  const [mapped, setMapped] = useState<Record<string, string> | null>(null);

  // Durable files (customer_documents + /opt/fasihi/documents)
  const [fileKey, setFileKey] = useState("C-K825221");
  const [fileTitle, setFileTitle] = useState("");
  const [fileCategory, setFileCategory] = useState("identity");
  const [file, setFile] = useState<File | null>(null);
  const [archiveFiles, setArchiveFiles] = useState<DurableArchiveFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  const reloadFiles = useCallback(async (key?: string) => {
    const k = archiveCustomerKey(key ?? fileKey);
    if (!k) {
      setArchiveFiles([]);
      return;
    }
    setFilesLoading(true);
    try {
      const r = await listArchiveFiles(k);
      if (!r.ok) {
        setArchiveFiles([]);
        return;
      }
      const items = r.items || r.documents || [];
      setArchiveFiles(Array.isArray(items) ? items : []);
    } catch {
      setArchiveFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }, [fileKey]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meta = await fetchDmsMeta();
      if (meta.ok && meta.counts) setCounts(meta.counts);
      await reloadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در بارگذاری");
    } finally {
      setLoading(false);
    }
  }, [reloadFiles]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onAssign() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await assignArchive({ dossierKey, branch, shelf, row, binder });
      if (!r.ok) {
        setError(r.error || "خطا");
        return;
      }
      setLocation(r.location || null);
      setMsg(`بارکد تخصیص یافت: ${r.barcode}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  async function onLookup() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const q = lookupQ.trim();
      const params = q.startsWith("DMS-") ? { barcode: q } : { dossierKey: q || dossierKey };
      const r = await lookupArchive(params);
      if (!r.ok) {
        setError(r.error || "خطا");
        return;
      }
      if (!r.found) {
        setLocation(null);
        setMsg("مکان یافت نشد");
        return;
      }
      setLocation(r.location || null);
      setMsg("مکان بایگانی پیدا شد");
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateDoc() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await createDocument({
        dossierKey: docDossier,
        kind: docKind,
        title: `سند ${kindLabel(docKind)}`,
        meta: { source: "ui-demo" },
      });
      if (!r.ok || !r.document) {
        setError(r.error || "خطا");
        return;
      }
      setDocument(r.document);
      setMsg(`سند #${r.document.id} · هش ${r.documentHash?.slice(0, 12)}…`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  async function onSign() {
    if (!document) {
      setError("ابتدا سند بسازید");
      return;
    }
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const payloadStub =
        signMethod === "touch"
          ? [
              { x: 10, y: 20 },
              { x: 30, y: 40 },
              { x: 50, y: 25 },
            ]
          : { templateId: "FP-DEMO-UI", score: 0.9 };
      const r = await signDocument({
        documentId: document.id,
        method: signMethod,
        payloadStub,
      });
      if (!r.ok) {
        setError(r.error || "خطا");
        return;
      }
      setDocument(r.document || document);
      setMsg(
        `امضا ثبت شد · هش سند ${r.documentHash?.slice(0, 16)}… · بیومتریک واقعی: خیر`,
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  async function onUploadFile() {
    if (!file) {
      setError("فایلی انتخاب نشده است");
      return;
    }
    const key = archiveCustomerKey(fileKey);
    if (!key) {
      setError("کلید بیمه‌گذار / پرونده الزامی است");
      return;
    }
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const contentBase64 = await fileToBase64(file);
      const r = await uploadArchiveFile({
        customerId: key,
        category: fileCategory,
        title: fileTitle.trim() || file.name,
        fileName: file.name,
        contentBase64,
      });
      if (!r.ok) {
        setError(r.error || "آپلود ناموفق بود");
        return;
      }
      setFile(null);
      setFileTitle("");
      setMsg(`فایل ذخیره شد · id ${r.document?.id ?? "—"} · مسیر /opt/fasihi/documents`);
      await reloadFiles(key);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "آپلود ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function onSoftDeleteFile(id: string | number) {
    if (!window.confirm("حذف نرم این فایل؟ فایل روی دیسک می‌ماند.")) return;
    setBusy(true);
    setError(null);
    try {
      const r = await softDeleteArchiveFile(id);
      if (!r.ok) {
        setError(r.error || "حذف نرم ناموفق بود");
        return;
      }
      setMsg("حذف نرم انجام شد");
      await reloadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حذف نرم ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function onOcr() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      // Local preview immediately
      setMapped(mapOcrFields(ocrType, stubText || null));
      const r = await postOcr({
        docType: ocrType,
        stubText: stubText || undefined,
        imageMeta: { demo: true, filename: "stub.jpg" },
      });
      if (!r.ok) {
        setError(r.error || "خطا");
        return;
      }
      setMapped(r.mappedFields || null);
      setMsg(`OCR job #${r.job?.id} · موتور stub · ML واقعی: خیر`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={MODULE_LABEL} subtitle="آپلود پایدار · بارکد زونکن · OCR stub">
      <div className="space-y-4" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Archive className="size-5 text-primary" aria-hidden />
            <h1 className="text-xl font-extrabold text-title">{MODULE_LABEL}</h1>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw className="size-4" />
            بروزرسانی
          </Button>
        </div>

        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          {DEMO_DISCLAIMER}
        </div>

        {(error || msg) && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              error
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100"
            }`}
          >
            {error || msg}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FlatKpi label="مکان‌های بایگانی" value={toFa(counts.archives ?? 0)} hint="زونکن فیزیکی" />
          <FlatKpi label="اسناد" value={toFa(counts.documents ?? 0)} hint="با هش SHA-256" />
          <FlatKpi label="امضاها" value={toFa(counts.signatures ?? 0)} hint="stub لمسی/اثرانگشت" />
          <FlatKpi label="OCR" value={toFa(counts.ocrJobs ?? 0)} hint="نقشه stub فارسی" />
        </div>

        <SectionCard title="مکان‌یاب بایگانی فیزیکی" description="تخصیص بارکد/QR و آدرس انبار (شعبه، قفسه، ردیف، زونکن)">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label>کلید پرونده</Label>
              <Input className={FIELD} value={dossierKey} onChange={(e) => setDossierKey(e.target.value)} />
            </div>
            <div>
              <Label>شعبه</Label>
              <Input className={FIELD} value={branch} onChange={(e) => setBranch(e.target.value)} />
            </div>
            <div>
              <Label>قفسه</Label>
              <Input className={FIELD} value={shelf} onChange={(e) => setShelf(e.target.value)} />
            </div>
            <div>
              <Label>ردیف</Label>
              <Input className={FIELD} value={row} onChange={(e) => setRow(e.target.value)} />
            </div>
            <div>
              <Label>زونکن</Label>
              <Input className={FIELD} value={binder} onChange={(e) => setBinder(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onAssign()} disabled={busy || loading}>
              تخصیص بارکد
            </Button>
            <Input
              className={`${FIELD} max-w-xs`}
              placeholder="جستجو بارکد یا کلید پرونده"
              value={lookupQ}
              onChange={(e) => setLookupQ(e.target.value)}
            />
            <Button type="button" variant="outline" onClick={() => void onLookup()} disabled={busy}>
              جستجو
            </Button>
          </div>
          {location && (
            <div className="mt-4 rounded-xl border border-border/60 bg-card/50 p-4 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">بارکد: </span>
                <span className="num font-mono text-xs">{location.barcode}</span>
              </p>
              <p>
                <span className="text-muted-foreground">آدرس: </span>
                شعبه {location.branch} · قفسه {location.shelf} · ردیف {location.row} · زونکن{" "}
                {location.binder}
              </p>
              <p className="break-all text-[11px] text-muted-foreground">
                QR payload: {location.qrPayload}
              </p>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="فایل‌های بایگانی (پایدار)"
          description="آپلود PDF/JPG/PNG به customer_documents · ذخیره روی /opt/fasihi/documents · سقف ۸ مگابایت"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Label>کلید بیمه‌گذار / پرونده (ترجیحاً C-K…)</Label>
              <Input
                className={FIELD}
                value={fileKey}
                onChange={(e) => setFileKey(e.target.value)}
                placeholder="C-K825221"
                dir="ltr"
              />
            </div>
            <div>
              <Label>دسته</Label>
              <select
                className={FIELD}
                value={fileCategory}
                onChange={(e) => setFileCategory(e.target.value)}
              >
                {FILE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>عنوان</Label>
              <Input
                className={FIELD}
                value={fileTitle}
                onChange={(e) => setFileTitle(e.target.value)}
                placeholder="مثلاً کارت ملی"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label>فایل (PDF / تصویر)</Label>
              <Input
                className={FIELD}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,.pdf,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onUploadFile()} disabled={busy || !file}>
              <FileUp className="size-4" />
              آپلود پایدار
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void reloadFiles()}
              disabled={busy || filesLoading}
            >
              <RefreshCw className="size-4" />
              فهرست فایل‌ها
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            کلید نرمال‌شده:{" "}
            <span className="num font-mono" dir="ltr">
              {archiveCustomerKey(fileKey) || "—"}
            </span>{" "}
            · API: <span className="num">/api/dms/files</span>
          </p>
          {filesLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">در حال بارگذاری فهرست…</p>
          ) : archiveFiles.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">فایلی برای این کلید ثبت نشده است.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="p-2 text-start">عنوان</th>
                    <th className="p-2 text-start">دسته</th>
                    <th className="p-2 text-start">حجم</th>
                    <th className="p-2 text-start">تاریخ</th>
                    <th className="p-2 text-start">اقدام</th>
                  </tr>
                </thead>
                <tbody>
                  {archiveFiles.map((d) => (
                    <tr key={String(d.id)} className="border-b border-border/50">
                      <td className="p-2">{d.title || d.originalName || "سند"}</td>
                      <td className="p-2 text-xs">{d.categoryLabel || d.category || "—"}</td>
                      <td className="num p-2 text-xs">{toFa(d.sizeBytes ?? 0)} بایت</td>
                      <td className="p-2 text-xs text-muted-foreground">{d.uploadedAt || "—"}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          <Button type="button" size="sm" variant="outline" asChild>
                            <a href={archiveFileUrl(d.id)} target="_blank" rel="noreferrer">
                              <Download className="size-3.5" />
                              مشاهده / دانلود
                            </a>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void onSoftDeleteFile(d.id)}
                          >
                            <Trash2 className="size-3.5" />
                            حذف نرم
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="فرم پیشنهاد + امضا stub" description="ثبت سند با هش SHA-256 و امضای لمسی/اثرانگشت DEMO">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>کلید پرونده</Label>
              <Input className={FIELD} value={docDossier} onChange={(e) => setDocDossier(e.target.value)} />
            </div>
            <div>
              <Label>نوع سند</Label>
              <select
                className={FIELD}
                value={docKind}
                onChange={(e) => setDocKind(e.target.value)}
              >
                <option value="proposal">فرم پیشنهاد</option>
                <option value="national_id_card">کارت ملی</option>
                <option value="birth_certificate">شناسنامه</option>
                <option value="health_booklet">دفترچه درمانی</option>
                <option value="accident_sketch">کروکی</option>
                <option value="other">سایر</option>
              </select>
            </div>
            <div>
              <Label>روش امضا</Label>
              <select
                className={FIELD}
                value={signMethod}
                onChange={(e) => setSignMethod(e.target.value as "touch" | "fingerprint")}
              >
                <option value="touch">لمس / strokes</option>
                <option value="fingerprint">اثرانگشت stub</option>
              </select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onCreateDoc()} disabled={busy}>
              ایجاد سند
            </Button>
            <Button type="button" variant="secondary" onClick={() => void onSign()} disabled={busy || !document}>
              امضای stub
            </Button>
          </div>
          {document && (
            <div className="mt-4 rounded-xl border border-border/60 bg-card/50 p-4 text-sm space-y-1">
              <p>
                سند #{document.id} · {kindLabel(String(document.kind))} ·{" "}
                {document.signed ? "امضاشده" : "بدون امضا"}
              </p>
              <p className="break-all font-mono text-[11px]">
                SHA-256: {document.documentHash}
              </p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="OCR فارسی stub" description="بدون ML — نقشه DEMO برای کارت ملی / شناسنامه / دفترچه / کروکی">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>نوع مدرک</Label>
              <select
                className={FIELD}
                value={ocrType}
                onChange={(e) => setOcrType(e.target.value as OcrDocType)}
              >
                {OCR_DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ocrTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>متن stub اختیاری (name:…|nationalId:…)</Label>
              <Input
                className={FIELD}
                value={stubText}
                onChange={(e) => setStubText(e.target.value)}
                placeholder="name:سارا|کدملی:0011223344"
              />
            </div>
          </div>
          <div className="mt-3">
            <Button type="button" onClick={() => void onOcr()} disabled={busy}>
              اجرای OCR stub
            </Button>
          </div>
          {mapped && (
            <div className="mt-4 rounded-xl border border-border/60 bg-card/50 p-4">
              <p className="mb-2 text-sm font-bold">پیش‌نمایش فیلدهای پرونده</p>
              <dl className="grid gap-2 sm:grid-cols-2 text-sm">
                {Object.entries(mapped).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-border/40 px-3 py-2">
                    <dt className="text-[11px] text-muted-foreground">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </SectionCard>

        <p className="text-[11px] text-muted-foreground">
          مسیر منو: سایر ← بایگانی · فایل پایدار: <span className="num">/api/dms/files</span> · stub:{" "}
          <span className="num">/api/dms/*</span> · بدون بیومتریک/ML واقعی · حجم:{" "}
          <span className="font-mono" dir="ltr">
            /opt/fasihi/documents
          </span>
        </p>
      </div>
    </AppShell>
  );
}
