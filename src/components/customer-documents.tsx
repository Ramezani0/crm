import { useCallback, useEffect, useState } from "react";
import { Download, FileUp, Trash2, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  documentCustomerKey,
  docDisplayTitle,
  fileToBase64,
  listCustomerDocuments,
  postCustomerDocument,
  softDeleteCustomerDocument,
  type CustomerDocument,
} from "@/lib/persist-api";
import { apiUrl } from "@/lib/api";
import { toFa } from "@/lib/format";
import type { Customer } from "@/lib/types";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "identity", label: "مدارک هویتی" },
  { value: "vehicle", label: "مدارک خودرو" },
  { value: "vehicle_inspection", label: "بازدید اولیه خودرو" },
  { value: "property", label: "مدارک ملک و آتش‌سوزی" },
  { value: "medical", label: "مدارک پزشکی" },
  { value: "proposal", label: "فرم پیشنهاد" },
  { value: "policy_document", label: "بیمه‌نامه / الحاقیه" },
  { value: "payment_receipt", label: "فیش واریز" },
  { value: "claim", label: "مدارک خسارت" },
  { value: "legal", label: "مدارک حقوقی" },
  { value: "other", label: "سایر" },
];

type Props = {
  customer: Customer;
  uploadedBy?: string;
};

/** آرشیو اسناد پرونده ۳۶۵ — list/upload/soft-delete via live documents API + C-K key. */
export function CustomerDocumentsPanel({ customer, uploadedBy }: Props) {
  const [items, setItems] = useState<CustomerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("other");
  const [file, setFile] = useState<File | null>(null);
  const docKey = documentCustomerKey(customer);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCustomerDocuments(customer);
      if (!res.ok) {
        setError(res.error || "خواندن فهرست اسناد ناموفق بود");
        setItems([]);
      } else {
        setItems(res.items);
      }
    } catch {
      setError("خطا در ارتباط با سرور اسناد");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [customer]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onUpload = async () => {
    if (!file) {
      setError("فایلی انتخاب نشده است");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const contentBase64 = await fileToBase64(file);
      const res = await postCustomerDocument({
        customerId: docKey,
        policyholderCode: docKey,
        category,
        title: title.trim() || file.name,
        fileTitle: title.trim() || file.name,
        fileName: file.name,
        filename: file.name,
        mimeType: file.type || undefined,
        contentBase64,
        uploadedBy,
      });
      if (!res.ok) {
        setError(res.error || "آپلود ناموفق بود");
      } else {
        setTitle("");
        setFile(null);
        await reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "آپلود ناموفق بود");
    } finally {
      setBusy(false);
    }
  };

  const onSoftDelete = async (id: string | number) => {
    if (!window.confirm("حذف نرم این سند؟ فایل روی سرور می‌ماند.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await softDeleteCustomerDocument(id);
      if (!res.ok) setError(res.error || "حذف نرم ناموفق بود");
      else await reload();
    } catch {
      setError("حذف نرم ناموفق بود");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          کلید بایگانی: <span className="num font-mono" dir="ltr">{docKey}</span> — مسیر سرور{" "}
          <span className="font-mono" dir="ltr">
            /opt/fasihi/documents
          </span>
        </p>
        <Button type="button" size="sm" variant="outline" disabled={loading || busy} onClick={() => void reload()}>
          <RefreshCw className="size-3.5" />
          تازه‌سازی
        </Button>
      </div>

      <div className="grid gap-3 rounded-xl border border-border/60 p-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="doc-title">عنوان سند</Label>
          <Input
            id="doc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً کارت ملی / فیش واریز"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="doc-cat">دسته</Label>
          <select
            id="doc-cat"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="doc-file">فایل (PDF / تصویر)</Label>
          <Input
            id="doc-file"
            type="file"
            accept="image/*,.pdf,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="button" size="sm" disabled={busy || !file} onClick={() => void onUpload()}>
            <FileUp className="size-3.5" />
            {busy ? "در حال ارسال…" : "آپلود به سرور"}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">در حال بارگذاری اسناد…</p>
      ) : items.length === 0 ? (
        <EmptyState title="سندی در این پرونده نیست" description="اولین مدرک را از فرم بالا بارگذاری کنید." />
      ) : (
        <div className="overflow-x-auto">
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
              {items.map((d) => (
                <tr key={String(d.id)} className="border-b border-border/50">
                  <td className="p-2">{docDisplayTitle(d)}</td>
                  <td className="p-2 text-xs">{d.categoryLabel || d.category || "—"}</td>
                  <td className="num p-2 text-xs">
                    {toFa(d.sizeBytes ?? d.fileSizeBytes ?? 0)} بایت
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {d.uploadedAt || d.createdAt || "—"}
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      <Button type="button" size="sm" variant="outline" asChild>
                        <a
                          href={apiUrl(`/api/documents/${encodeURIComponent(String(d.id))}/file` as `/api/${string}`)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download className="size-3.5" />
                          مشاهده
                        </a>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void onSoftDelete(d.id)}
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
    </div>
  );
}
