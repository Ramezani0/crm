import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bookmark, Download, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell, SectionCard } from "@/components/app-shell";
import { useDebounced, useStore } from "@/lib/store";
import { CUSTOMER_LABEL, CustomerBadge } from "@/components/status-badge";
import { formatDate, formatNumber, toFa } from "@/lib/format";
import { displayText } from "@/lib/display";
import { downloadCsv } from "@/lib/csv";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, TableSkeleton } from "@/components/states";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Customer, CustomerStatus } from "@/lib/types";

export const Route = createFileRoute("/customers/")({
  head: () => ({
    meta: [
      { title: "بیمه‌گذاران | CRM فصیحی" },
      { name: "description", content: "فهرست کامل بیمه‌گذاران با جست‌وجو، فیلتر پیشرفته، فیلترهای ذخیره‌شده و عملیات گروهی." },
      { property: "og:title", content: "مدیریت بیمه‌گذاران" },
      { property: "og:description", content: "جست‌وجو، فیلتر و مدیریت اطلاعات مشتریان دفتر بیمه فصیحی." },
    ],
  }),
  component: CustomersPage,
});

const PAGE_SIZE = 12;

function CustomersPage() {
  const {
    customers,
    policies,
    hydrated,
    can,
    savedFilters,
    saveFilter,
    removeFilter,
    bulkUpdateCustomers,
    deleteCustomers,
    upsertCustomer,
  } = useStore();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [city, setCity] = useState("all");
  const [segment, setSegment] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [open, setOpen] = useState(false);
  const q = useDebounced(search, 300);

  const cities = useMemo(() => [...new Set(customers.map((c) => c.city))].sort(), [customers]);

  const filtered = useMemo(() => {
    const needle = q.trim();
    return customers.filter(
      (c) =>
        (status === "all" || c.status === status) &&
        (city === "all" || c.city === city) &&
        (segment === "all" || c.segment === segment) &&
        (!needle ||
          c.fullName.includes(needle) ||
          c.nationalId.includes(needle) ||
          c.phone.includes(needle) ||
          c.email.includes(needle)),
    );
  }, [customers, q, status, city, segment]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const allChecked = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  const resetPage = () => setPage(1);
  const editable = !hydrated || can("customers.edit");

  const applySaved = (id: string) => {
    const f = savedFilters.find((x) => x.id === id);
    if (!f) return;
    setSearch(f.query.search);
    setStatus(f.query.status);
    setCity(f.query.city);
    setSegment(f.query.segment);
    resetPage();
  };

  const selectClass =
    "h-9 rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <AppShell
      title="بیمه‌گذاران"
      subtitle={`${formatNumber(filtered.length)} رکورد مطابق فیلتر فعلی`}
      permission="customers.view"
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                "customers.csv",
                filtered.map((c) => ({
                  نام: c.fullName,
                  کدملی: c.nationalId,
                  موبایل: c.phone,
                  شهر: c.city,
                  وضعیت: c.statusLabel?.trim() || CUSTOMER_LABEL[c.status],
                })),
              )
            }
          >
            <Download className="size-4" aria-hidden /> خروجی CSV
          </Button>
          {editable && (
            <Dialog
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) setEditing(null);
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => setEditing(null)}>
                  <Plus className="size-4" aria-hidden /> بیمه‌گذار جدید
                </Button>
              </DialogTrigger>
              <CustomerDialog
                key={editing?.id ?? "new"}
                customer={editing}
                onSave={(c) => {
                  upsertCustomer(c);
                  setOpen(false);
                  setEditing(null);
                  toast.success("اطلاعات بیمه‌گذار ذخیره شد.");
                }}
              />
            </Dialog>
          )}
        </>
      }
    >
      <SectionCard>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1 space-y-1">
            <Label htmlFor="q">جست‌وجو</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="q"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  resetPage();
                }}
                placeholder="نام، کد ملی، موبایل یا ایمیل…"
                className="pe-9"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="st">وضعیت</Label>
            <select id="st" className={selectClass} value={status} onChange={(e) => { setStatus(e.target.value); resetPage(); }}>
              <option value="all">همه</option>
              <option value="active">فعال</option>
              <option value="inactive">غیرفعال</option>
              <option value="lead">سرنخ</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ct">شهر</Label>
            <select id="ct" className={selectClass} value={city} onChange={(e) => { setCity(e.target.value); resetPage(); }}>
              <option value="all">همه</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sg">نوع</Label>
            <select id="sg" className={selectClass} value={segment} onChange={(e) => { setSegment(e.target.value); resetPage(); }}>
              <option value="all">همه</option>
              <option value="حقیقی">حقیقی</option>
              <option value="حقوقی">حقوقی</option>
            </select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const name = window.prompt("نام فیلتر ذخیره‌شده:");
              if (!name) return;
              saveFilter({ id: `F-${Date.now()}`, name, query: { search, status, city, segment } });
              toast.success("فیلتر ذخیره شد.");
            }}
          >
            <Bookmark className="size-4" aria-hidden /> ذخیره فیلتر
          </Button>
        </div>

        {savedFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {savedFilters.map((f) => (
              <span key={f.id} className="flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-xs">
                <button onClick={() => applySaved(f.id)} className="font-medium">
                  {f.name}
                </button>
                <button onClick={() => removeFilter(f.id)} aria-label={`حذف فیلتر ${f.name}`}>
                  <X className="size-3 text-muted-foreground" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
      </SectionCard>

      {selected.length > 0 && editable && (
        <div className="glass flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-sm">
          <span className="font-semibold">{toFa(selected.length)} رکورد انتخاب شده</span>
          <Button size="sm" variant="outline" onClick={() => { bulkUpdateCustomers(selected, { status: "active" }); toast.success("وضعیت به فعال تغییر کرد."); }}>
            فعال‌سازی گروهی
          </Button>
          <Button size="sm" variant="outline" onClick={() => { bulkUpdateCustomers(selected, { status: "inactive" }); toast.success("وضعیت به غیرفعال تغییر کرد."); }}>
            غیرفعال‌سازی گروهی
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              deleteCustomers(selected);
              setSelected([]);
              toast.success("رکوردهای انتخاب‌شده حذف شدند.");
            }}
          >
            <Trash2 className="size-4" aria-hidden /> حذف
          </Button>
          <button className="text-xs text-muted-foreground" onClick={() => setSelected([])}>
            لغو انتخاب
          </button>
        </div>
      )}

      <SectionCard>
        {!hydrated ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState title="بیمه‌گذاری یافت نشد" description="فیلترها را تغییر دهید یا رکورد جدیدی ثبت کنید." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-sm">
              <caption className="sr-only">فهرست بیمه‌گذاران</caption>
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start">
                    <Checkbox
                      checked={allChecked}
                      aria-label="انتخاب همه"
                      onCheckedChange={(v) =>
                        setSelected(v ? [...new Set([...selected, ...rows.map((r) => r.id)])] : selected.filter((id) => !rows.some((r) => r.id === id)))
                      }
                    />
                  </th>
                  <th className="p-2 text-start">نام و نام خانوادگی</th>
                  <th className="p-2 text-start">کد ملی</th>
                  <th className="p-2 text-start">موبایل</th>
                  <th className="p-2 text-start">شهر</th>
                  <th className="p-2 text-start">نوع</th>
                  <th className="p-2 text-start">بیمه‌نامه</th>
                  <th className="p-2 text-start">وضعیت</th>
                  <th className="p-2 text-start">تاریخ ثبت</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-secondary/40">
                    <td className="p-2">
                      <Checkbox
                        checked={selected.includes(c.id)}
                        aria-label={`انتخاب ${c.fullName}`}
                        onCheckedChange={(v) => setSelected(v ? [...selected, c.id] : selected.filter((x) => x !== c.id))}
                      />
                    </td>
                    <td className="p-2 font-medium">
                      <Link to="/customers/$id" params={{ id: c.id }} className="hover:text-primary">
                        {displayText(c.fullName)}
                      </Link>
                    </td>
                    <td className="num p-2 text-xs">{displayText(c.nationalId ? toFa(c.nationalId) : "")}</td>
                    <td className="num p-2 text-xs">{displayText(c.phone ? toFa(c.phone) : "")}</td>
                    <td className="p-2">{displayText(c.city)}</td>
                    <td className="p-2">{c.segment}</td>
                    <td className="p-2">{toFa(policies.filter((p) => p.customerId === c.id).length)}</td>
                    <td className="p-2">
                      <CustomerBadge status={c.status} statusLabel={c.statusLabel} />
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{formatDate(c.createdAt)}</td>
                    <td className="p-2 text-end">
                      {editable && (
                        <button
                          className="text-xs text-primary"
                          onClick={() => {
                            setEditing(c);
                            setOpen(true);
                          }}
                        >
                          ویرایش
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-xs text-muted-foreground">
            صفحه {toFa(current)} از {toFa(pageCount)}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={current === 1} onClick={() => setPage(current - 1)}>
              قبلی
            </Button>
            <Button variant="outline" size="sm" disabled={current === pageCount} onClick={() => setPage(current + 1)}>
              بعدی
            </Button>
          </div>
        </div>
      </SectionCard>
    </AppShell>
  );
}

function makeEmptyCustomer(): Customer {
  return {
    id: `C-${Date.now()}`,
    fullName: "",
    nationalId: "",
    phone: "",
    email: "",
    city: "تهران",
    status: "active",
    segment: "حقیقی",
    agent: "سمیرا کریمی",
    createdAt: new Date().toISOString(),
  };
}

function CustomerDialog({ customer, onSave }: { customer: Customer | null; onSave: (c: Customer) => void }) {
  const [form, setForm] = useState<Customer>(() => customer ?? makeEmptyCustomer());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(customer ?? makeEmptyCustomer());
    setError(null);
  }, [customer?.id]);

  const set = (k: keyof Customer, v: string) => setForm({ ...form, [k]: v } as Customer);

  const validate = () => {
    if (form.fullName.trim().length < 3) return "نام باید حداقل ۳ نویسه باشد.";
    if (!/^\d{10}$/.test(form.nationalId)) return "کد ملی باید ۱۰ رقم باشد.";
    const phone = form.phone.trim();
    if (phone && !/^09\d{9}$/.test(phone)) return "شماره موبایل معتبر نیست.";
    return null;
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{customer ? "ویرایش بیمه‌گذار" : "ثبت بیمه‌گذار جدید"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="fn">نام و نام خانوادگی</Label>
          <Input id="fn" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ni">کد ملی</Label>
          <Input id="ni" value={form.nationalId} onChange={(e) => set("nationalId", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ph">موبایل</Label>
          <Input id="ph" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="em">ایمیل</Label>
          <Input id="em" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cy">شهر</Label>
          <Input id="cy" value={form.city} onChange={(e) => set("city", e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="nt">یادداشت</Label>
          <Input id="nt" value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button
          onClick={() => {
            const err = validate();
            if (err) return setError(err);
            setError(null);
            onSave({ ...form, status: form.status as CustomerStatus });
          }}
        >
          ذخیره
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
