import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, SectionCard } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { parseCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toFa } from "@/lib/format";
import type { Customer } from "@/lib/types";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "ورود اطلاعات از فایل | CRM فصیحی" },
      { name: "description", content: "بارگذاری فایل CSV/XLSX، نگاشت ستون‌ها، اعتبارسنجی، تشخیص تکراری و ثبت گروهی." },
      { property: "og:title", content: "ورود اطلاعات از فایل" },
      { property: "og:description", content: "فرایند گام‌به‌گام ورود اطلاعات مشتریان با پیش‌نمایش خطاها." },
    ],
  }),
  component: ImportPage,
});

const FIELDS = [
  { key: "fullName", label: "نام و نام خانوادگی" },
  { key: "nationalId", label: "کد ملی" },
  { key: "phone", label: "موبایل" },
  { key: "city", label: "شهر" },
] as const;

function ImportPage() {
  const { customers, importCustomers } = useStore();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState(0);

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    const auto: Record<string, string> = {};
    FIELDS.forEach((f) => {
      const found = parsed.headers.find((h) => h.includes(f.label) || h.toLowerCase() === f.key.toLowerCase());
      if (found) auto[f.key] = found;
    });
    setMap(auto);
    setProgress(0);
  };

  const idx = (key: string) => headers.indexOf(map[key] ?? "");

  const validated = rows.map((r, i) => {
    const rec = {
      fullName: idx("fullName") >= 0 ? r[idx("fullName")]?.trim() ?? "" : "",
      nationalId: idx("nationalId") >= 0 ? r[idx("nationalId")]?.trim() ?? "" : "",
      phone: idx("phone") >= 0 ? r[idx("phone")]?.trim() ?? "" : "",
      city: idx("city") >= 0 ? r[idx("city")]?.trim() ?? "تهران" : "تهران",
    };
    const errors: string[] = [];
    if (rec.fullName.length < 3) errors.push("نام نامعتبر");
    if (!/^\d{10}$/.test(rec.nationalId)) errors.push("کد ملی باید ۱۰ رقم باشد");
    if (!/^09\d{9}$/.test(rec.phone)) errors.push("موبایل نامعتبر");
    const duplicate = customers.some((c) => c.nationalId === rec.nationalId);
    return { line: i + 2, rec, errors, duplicate };
  });

  const valid = validated.filter((v) => v.errors.length === 0 && !v.duplicate);

  const commit = () => {
    let p = 0;
    const timer = setInterval(() => {
      p += 20;
      setProgress(Math.min(p, 100));
      if (p >= 100) {
        clearInterval(timer);
        importCustomers(
          valid.map<Customer>((v) => ({
            id: `C-${Date.now()}-${v.line}`,
            fullName: v.rec.fullName,
            nationalId: v.rec.nationalId,
            phone: v.rec.phone,
            email: `${v.rec.nationalId}@fasihi.ir`,
            city: v.rec.city,
            status: "active",
            segment: "حقیقی",
            agent: "سمیرا کریمی",
            createdAt: new Date().toISOString(),
          })),
        );
        toast.success(`${toFa(valid.length)} رکورد با موفقیت وارد شد.`);
        setRows([]);
        setHeaders([]);
      }
    }, 200);
  };

  return (
    <AppShell title="ورود اطلاعات از فایل" subtitle="CSV / XLSX (خروجی CSV)" permission="import.run">
      <SectionCard title="۱. بارگذاری فایل" description="فایل CSV با ستون‌های نام، کد ملی، موبایل و شهر">
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="انتخاب فایل"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          className="block w-full rounded-lg border border-dashed border-border bg-card/60 p-6 text-sm"
        />
      </SectionCard>

      {headers.length > 0 && (
        <>
          <SectionCard title="۲. نگاشت ستون‌ها">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {FIELDS.map((f) => (
                <label key={f.key} className="space-y-1 text-sm">
                  <span className="text-muted-foreground">{f.label}</span>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                    value={map[f.key] ?? ""}
                    onChange={(e) => setMap({ ...map, [f.key]: e.target.value })}
                  >
                    <option value="">— انتخاب ستون —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="۳. پیش‌نمایش و اعتبارسنجی" description={`${toFa(valid.length)} رکورد آماده ثبت از ${toFa(rows.length)} سطر`}>
            <div className="max-h-80 overflow-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="p-2 text-start">سطر</th>
                    <th className="p-2 text-start">نام</th>
                    <th className="p-2 text-start">کد ملی</th>
                    <th className="p-2 text-start">موبایل</th>
                    <th className="p-2 text-start">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {validated.slice(0, 80).map((v) => (
                    <tr key={v.line} className="border-b border-border/50">
                      <td className="p-2 text-xs">{toFa(v.line)}</td>
                      <td className="p-2">{v.rec.fullName}</td>
                      <td className="num p-2 text-xs">{toFa(v.rec.nationalId)}</td>
                      <td className="num p-2 text-xs">{toFa(v.rec.phone)}</td>
                      <td className="p-2 text-xs">
                        {v.errors.length ? (
                          <span className="text-destructive">{v.errors.join("، ")}</span>
                        ) : v.duplicate ? (
                          <span className="text-warning">تکراری — کد ملی موجود است</span>
                        ) : (
                          <span className="text-success">آماده ثبت</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {progress > 0 && <Progress value={progress} className="mt-4" />}
            <Button className="mt-4" disabled={valid.length === 0} onClick={commit}>
              ثبت {toFa(valid.length)} رکورد معتبر
            </Button>
          </SectionCard>
        </>
      )}
    </AppShell>
  );
}
