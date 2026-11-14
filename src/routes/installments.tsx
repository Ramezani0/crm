import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell, SectionCard } from "@/components/app-shell";
import { CustomerNameLink, PolicyDossierLink } from "@/components/customer-name-link";
import { RecordActions } from "@/components/record-actions";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { InstallmentBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounced, useStore } from "@/lib/store";
import {
  apiDataErrorMessage,
  DUE_INSTALLMENT_STATUS_QUERY,
  fetchInstallmentsDue,
} from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { crmPageSubtitle } from "@/lib/crm-source";
import {
  installmentRows,
  mapDueInstallment,
  type FeedInstallment,
} from "@/lib/due-lists";
import { emptyDash, formatDate, formatNumber, toFa } from "@/lib/format";
import { fetchPersistMeta } from "@/lib/persist-api";

export const Route = createFileRoute("/installments")({
  head: () => ({
    meta: [
      { title: `اقساط | ${BRAND.title}` },
      { name: "description", content: "اقساط و مطالبات نمایندگی ۳۰۴۵." },
    ],
  }),
  component: InstallmentsPage,
});

const PAGE_SIZE = 50;

function InstallmentsPage() {
  const { customers, policies, crmSource, crmError, retryCrmData, today, registerPayment, can } =
    useStore();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [page, setPage] = useState(0);
  const [slim, setSlim] = useState<FeedInstallment[]>([]);
  const [slimTotal, setSlimTotal] = useState(0);
  const [slimState, setSlimState] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [slimError, setSlimError] = useState<string | null>(null);
  const [persistLive, setPersistLive] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canPay = can("installments.pay");

  const loadPage = useCallback(async (pageIndex: number, query: string) => {
    setSlimState("pending");
    setSlimError(null);
    try {
      const res = await fetchInstallmentsDue(
        PAGE_SIZE,
        pageIndex * PAGE_SIZE,
        DUE_INSTALLMENT_STATUS_QUERY,
        query,
      );
      const asOf = new Date();
      setSlim(res.data.installments.map((row, i) => mapDueInstallment(row, i, asOf)));
      setSlimTotal(Number(res.data.total) || res.data.installments.length);
      setSlimState("done");
    } catch (err) {
      setSlimError(apiDataErrorMessage(err, "/api/installments"));
      setSlimState("error");
    }
  }, []);

  useEffect(() => {
    if (crmSource === "mock") return;
    void loadPage(page, dq.trim());
  }, [page, dq, crmSource, loadPage]);

  useEffect(() => {
    setPage(0);
  }, [dq]);

  useEffect(() => {
    let cancelled = false;
    void fetchPersistMeta().then((res) => {
      if (cancelled) return;
      const live =
        Boolean(res && "ok" in res && res.ok) &&
        Array.isArray((res as { endpoints?: string[] }).endpoints) &&
        ((res as { endpoints?: string[] }).endpoints || []).some((e) =>
          e.includes("/api/installments/payment"),
        );
      setPersistLive(live);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(
    () =>
      installmentRows({
        installments: slim,
        customers,
        policies,
        today,
        limit: Math.max(slim.length, PAGE_SIZE),
      }),
    [slim, customers, policies, today],
  );

  const pageCount = Math.max(1, Math.ceil(slimTotal / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);

  const retry = () => {
    void loadPage(page, dq.trim());
    retryCrmData();
  };

  const waiting = slimState === "pending" || slimState === "idle";
  const failed = slimState === "error" && rows.length === 0;

  const markPaid = async (row: (typeof rows)[number]) => {
    if (!canPay || busyId) return;
    const amount = row.remaining > 0 ? row.remaining : row.amount;
    if (!(amount > 0)) {
      toast.message("مانده‌ای برای ثبت نیست");
      return;
    }
    setBusyId(row.id);
    try {
      registerPayment(row.id, amount, "پرداخت شد");
      if (persistLive) {
        toast.success("پرداخت ثبت شد (persist)");
      } else {
        toast.message("پرداخت محلی — API persist در دسترس نیست (stub/local)");
      }
      setSlim((prev) => prev.filter((i) => i.id !== row.id));
      setSlimTotal((t) => Math.max(0, t - 1));
    } finally {
      setBusyId(null);
    }
  };

  const persistHint =
    persistLive === null
      ? ""
      : persistLive
        ? " — ثبت پرداخت روی API زنده"
        : " — برچسب stub: persist پرداخت در دسترس نیست";

  return (
    <AppShell title="اقساط" subtitle={crmPageSubtitle(crmSource)} permission="installments.view">
      <SectionCard
        title="سررسید و معوقات"
        description={`${toFa(slimTotal)} قسط سررسید/معوق از /api/installments${persistHint}`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجو نام / کد / بیمه‌نامه…"
            className="max-w-sm"
            aria-label="جستجوی اقساط"
          />
        </div>
        {waiting && rows.length === 0 ? (
          <TableSkeleton rows={8} cols={5} />
        ) : failed ? (
          <ErrorState
            message={slimError || crmError || "خواندن /api/installments ناموفق بود."}
            onRetry={retry}
          />
        ) : rows.length === 0 ? (
          <EmptyState title="قسط سررسید یا معوقی در دادهٔ فعلی نیست" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-base">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="p-2 text-start">بیمه‌گذار</th>
                    <th className="p-2 text-start">بیمه‌نامه</th>
                    <th className="p-2 text-start">ردیف</th>
                    <th className="p-2 text-start">مبلغ</th>
                    <th className="p-2 text-start">سررسید</th>
                    <th className="p-2 text-start">روز معوق</th>
                    <th className="p-2 text-start">وضعیت</th>
                    <th className="p-2 text-start">اقدام</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id} className="border-b border-border/50">
                      <td className="p-2">
                        <CustomerNameLink customerId={i.customerId} name={i.customerName} />
                      </td>
                      <td className="p-2">
                        <PolicyDossierLink
                          customerId={i.customerId}
                          label={emptyDash(i.policyLabel)}
                          policyId={i.policyId}
                        />
                      </td>
                      <td className="num p-2">{toFa(i.seq)}</td>
                      <td className="num p-2">{formatNumber(i.amount)}</td>
                      <td className="p-2 text-xs text-muted-foreground">{formatDate(i.dueDate)}</td>
                      <td className="num p-2 text-xs">
                        {Number.isFinite(i.daysOverdue) ? `${toFa(i.daysOverdue)} روز` : "—"}
                      </td>
                      <td className="p-2">
                        <InstallmentBadge status={i.status} />
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {canPay ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busyId === i.id}
                              onClick={() => void markPaid(i)}
                              title={
                                persistLive
                                  ? "ثبت کامل پرداخت روی API"
                                  : "ثبت محلی — API persist در دسترس نیست"
                              }
                            >
                              پرداخت شد
                              {persistLive === false ? (
                                <span className="ms-1 text-[10px] text-muted-foreground">(stub)</span>
                              ) : null}
                            </Button>
                          ) : null}
                          <RecordActions
                            mobile={customers.find((c) => c.id === i.customerId)?.phone}
                            contextLabel={i.customerName || i.policyLabel}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <p>
                نمایش {toFa(rows.length)} از {toFa(slimTotal)} — صفحه {toFa(safePage + 1)} از{" "}
                {toFa(pageCount)}
                {slimState === "pending" ? " …" : ""}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 0 || slimState === "pending"}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  قبلی
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage >= pageCount - 1 || slimState === "pending"}
                  onClick={() => setPage((p) => p + 1)}
                >
                  بعدی
                </Button>
              </div>
            </div>
          </>
        )}
      </SectionCard>
    </AppShell>
  );
}
