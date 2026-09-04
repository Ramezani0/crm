import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell, SectionCard } from "@/components/app-shell";
import { useDebounced, useStore } from "@/lib/store";
import { INSTALLMENT_LABEL, InstallmentBadge } from "@/components/status-badge";
import { formatDate, formatNumber, toFa } from "@/lib/format";
import { displayDate, displayText } from "@/lib/display";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";
import { EmptyState, TableSkeleton } from "@/components/states";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/installments")({
  head: () => ({
    meta: [
      { title: "اقساط و پرداخت‌ها | CRM فصیحی" },
      { name: "description", content: "مدیریت اقساط پرداخت‌شده، سررسید، معوق و جزئی به همراه ثبت پرداخت." },
      { property: "og:title", content: "اقساط و پرداخت‌ها" },
      { property: "og:description", content: "پایش وصول مطالبات و ثبت پرداخت اقساط بیمه‌نامه‌ها." },
    ],
  }),
  component: InstallmentsPage,
});

function InstallmentsPage() {
  const { installments, customers, policies, hydrated, can, registerPayment } = useStore();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [payId, setPayId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("درگاه بانکی");
  const q = useDebounced(search, 300);

  const name = (i: { customerId: string; holderName?: string }) =>
    displayText(i.holderName) !== "—"
      ? displayText(i.holderName)
      : displayText(customers.find((c) => c.id === i.customerId)?.fullName);
  const policyNo = (id: string) => policies.find((p) => p.id === id)?.number ?? "—";

  const filtered = useMemo(
    () =>
      installments.filter(
        (i) => (status === "all" || i.status === status) && (!q.trim() || name(i).includes(q.trim())),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installments, status, q, customers],
  );

  const rows = filtered.slice((page - 1) * 12, page * 12);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
  const target = installments.find((i) => i.id === payId);
  const canPay = !hydrated || can("installments.pay");

  return (
    <AppShell
      title="اقساط و پرداخت‌ها"
      subtitle={`${formatNumber(filtered.length)} قسط`}
      permission="installments.view"
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            downloadCsv(
              "installments.csv",
              filtered.map((i) => ({
                بیمه‌گذار: name(i),
                بیمه‌نامه: policyNo(i.policyId),
                مبلغ: i.amount,
                پرداختی: i.paidAmount,
                وضعیت: i.statusLabel?.trim() || INSTALLMENT_LABEL[i.status],
              })),
            )
          }
        >
          خروجی CSV
        </Button>
      }
    >
      <SectionCard>
        <div className="flex flex-wrap gap-3">
          <Input
            className="max-w-xs"
            placeholder="نام بیمه‌گذار…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="جست‌وجوی قسط"
          />
          <select
            className="h-9 rounded-md border border-input bg-card px-3 text-sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="وضعیت قسط"
          >
            <option value="all">همه وضعیت‌ها</option>
            <option value="paid">پرداخت‌شده</option>
            <option value="due">در انتظار سررسید</option>
            <option value="overdue">معوق</option>
            <option value="partial">پرداخت جزئی</option>
          </select>
        </div>
      </SectionCard>

      <SectionCard>
        {!hydrated ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState title="قسطی یافت نشد" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start">بیمه‌گذار</th>
                  <th className="p-2 text-start">بیمه‌نامه</th>
                  <th className="p-2 text-start">قسط</th>
                  <th className="p-2 text-start">مبلغ (ریال)</th>
                  <th className="p-2 text-start">پرداختی</th>
                  <th className="p-2 text-start">سررسید</th>
                  <th className="p-2 text-start">وضعیت</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} className="border-b border-border/50 hover:bg-secondary/40">
                    <td className="p-2 font-medium">{name(i)}</td>
                    <td className="num p-2 text-xs">{displayText(policyNo(i.policyId) === "—" || policyNo(i.policyId) === "" ? "" : toFa(policyNo(i.policyId)))}</td>
                    <td className="p-2">{toFa(i.seq)}</td>
                    <td className="num p-2">{formatNumber(i.amount)}</td>
                    <td className="num p-2 text-muted-foreground">{formatNumber(i.paidAmount)}</td>
                    <td className="p-2 text-xs text-muted-foreground">{displayDate(i.dueDate, formatDate)}</td>
                    <td className="p-2">
                      <InstallmentBadge status={i.status} statusLabel={i.statusLabel} />
                    </td>
                    <td className="p-2 text-end">
                      {canPay && i.status !== "paid" && (
                        <button
                          className="text-xs text-primary"
                          onClick={() => {
                            setPayId(i.id);
                            setAmount(String(i.amount - i.paidAmount));
                          }}
                        >
                          ثبت پرداخت
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            صفحه {toFa(page)} از {toFa(pageCount)}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              قبلی
            </Button>
            <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
              بعدی
            </Button>
          </div>
        </div>
      </SectionCard>

      <Dialog open={!!payId} onOpenChange={(o) => !o && setPayId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ثبت پرداخت قسط</DialogTitle>
          </DialogHeader>
          {target && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                مانده این قسط: <span className="num font-semibold">{formatNumber(target.amount - target.paidAmount)}</span> ریال
              </p>
              <div className="space-y-1">
                <Label htmlFor="amt">مبلغ پرداخت (ریال)</Label>
                <Input id="amt" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mth">روش پرداخت</Label>
                <select
                  id="mth"
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  {["درگاه بانکی", "کارت به کارت", "نقدی", "چک"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                const value = Number(amount);
                if (!Number.isFinite(value) || value <= 0) return toast.error("مبلغ وارد شده معتبر نیست.");
                registerPayment(payId!, value, method);
                setPayId(null);
                toast.success("پرداخت با موفقیت ثبت شد.");
              }}
            >
              ثبت پرداخت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
