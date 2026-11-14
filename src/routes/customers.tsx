import { useEffect, useMemo, useState } from "react";
import { Outlet, createFileRoute, useRouterState, Link } from "@tanstack/react-router";
import { AppShell, SectionCard } from "@/components/app-shell";
import { CustomerNameLink } from "@/components/customer-name-link";
import { ErrorState, TableSkeleton } from "@/components/states";
import { CustomerBadge } from "@/components/status-badge";
import { RecordActions } from "@/components/record-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchCustomersPage } from "@/lib/api";
import { useStore, useDebounced } from "@/lib/store";
import { BRAND } from "@/lib/brand";
import { crmPageSubtitle, crmSourceCaption } from "@/lib/crm-source";
import { matchesDossierQuery } from "@/lib/dossier";
import { displayHolderCode, emptyDash, toFa } from "@/lib/format";
import { mapCustomer } from "@/lib/map-api-data";
import type { Customer } from "@/lib/types";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: `مشتریان | ${BRAND.title}` },
      { name: "description", content: "فهرست بیمه‌گذاران نمایندگی ۳۰۴۵." },
    ],
  }),
  component: CustomersLayout,
});

const PAGE_SIZE = 50;

function CustomersLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isDossier = pathname.startsWith("/customers/") && pathname.length > "/customers/".length;
  if (isDossier) {
    return <Outlet />;
  }
  return <CustomersList />;
}

function CustomersList() {
  const { customers, crmSource, crmError, retryCrmData } = useStore();
  const [q, setQ] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<"all" | "حقیقی" | "حقوقی">("all");
  const [page, setPage] = useState(0);
  const dq = useDebounced(q, 200);
  const [slimCustomers, setSlimCustomers] = useState<Customer[]>([]);
  const [slimTotal, setSlimTotal] = useState(0);
  const [slimError, setSlimError] = useState<string | null>(null);
  const [slimPending, setSlimPending] = useState(true);

  useEffect(() => {
    if (customers.length > 0) {
      setSlimPending(false);
      return;
    }
    let cancelled = false;
    setSlimPending(true);
    fetchCustomersPage(
      PAGE_SIZE,
      page * PAGE_SIZE,
      dq.trim(),
      segmentFilter === "all" ? {} : { segment: segmentFilter },
    )
      .then((res) => {
        if (cancelled) return;
        setSlimCustomers(res.data.customers.map((row, i) => mapCustomer(row, i)));
        setSlimTotal(res.data.total);
        setSlimError(null);
        setSlimPending(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setSlimError(err instanceof Error ? err.message : "خواندن فهرست مشتریان ناموفق بود.");
        setSlimPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customers.length, page, dq, segmentFilter]);

  const usingStore = customers.length > 0;
  const list = usingStore ? customers : slimCustomers;
  const filtered = useMemo(
    () =>
      usingStore
        ? list.filter(
            (c) =>
              matchesDossierQuery(dq, [
                c.fullName,
                c.nationalId,
                c.phone,
                c.city,
                c.agent,
                c.legalEntityId,
                c.statusLabel,
                c.id,
                c.holderCode,
              ]) &&
              (segmentFilter === "all" || c.segment === segmentFilter),
          )
        : list.filter((c) => segmentFilter === "all" || c.segment === segmentFilter),
    [list, dq, segmentFilter, usingStore],
  );
  const pageCount = usingStore
    ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    : Math.max(1, Math.ceil(slimTotal / PAGE_SIZE) || 1);
  const safePage = Math.min(page, pageCount - 1);
  const rows = usingStore
    ? filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
    : filtered;
  const shownTotal = usingStore ? filtered.length : slimTotal;
  const showTable = list.length > 0;
  const showSkeleton = (usingStore ? crmSource === "pending" : slimPending) && !showTable;
  const showError = (usingStore ? crmSource === "error" : Boolean(slimError)) && !showTable;
  const errorMessage = usingStore
    ? crmError || "خواندن فهرست مشتریان ناموفق بود."
    : slimError || "خواندن فهرست مشتریان ناموفق بود.";
  const onRetry = usingStore
    ? retryCrmData
    : () => {
        setPage(0);
        setSlimPending(true);
        setSlimError(null);
        fetchCustomersPage(
          PAGE_SIZE,
          0,
          dq.trim(),
          segmentFilter === "all" ? {} : { segment: segmentFilter },
        )
          .then((res) => {
            setSlimCustomers(res.data.customers.map((row, i) => mapCustomer(row, i)));
            setSlimTotal(res.data.total);
            setSlimError(null);
            setSlimPending(false);
          })
          .catch((err) => {
            setSlimError(err instanceof Error ? err.message : "خواندن فهرست مشتریان ناموفق بود.");
            setSlimPending(false);
          });
      };
  const subtitleSource = usingStore
    ? crmSource
    : slimPending
      ? "pending"
      : slimError
        ? "error"
        : "live";
  const captionCount = usingStore ? customers.length : slimTotal;

  return (
    <AppShell
      title="مشتریان"
      subtitle={crmPageSubtitle(subtitleSource as typeof crmSource)}
      permission="customers.view"
    >
      <SectionCard
        title="بیمه‌گذاران"
        description={`${crmSourceCaption(subtitleSource as typeof crmSource, captionCount, "مشتری")} — نام یا بیمه‌نامه را بزنید تا پرونده ۳۶۵ باز شود`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="جستجوی نام، کد ملی، تلفن…"
              className="w-56"
              aria-label="جستجوی مشتری"
            />
            <select
              value={segmentFilter}
              onChange={(e) => {
                setSegmentFilter(e.target.value as "all" | "حقیقی" | "حقوقی");
                setPage(0);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="فیلتر نوع بیمه‌گذار"
            >
              <option value="all">همه</option>
              <option value="حقیقی">حقیقی</option>
              <option value="حقوقی">حقوقی</option>
            </select>
          </div>
        }
      >
        {showSkeleton ? (
          <TableSkeleton rows={8} cols={6} />
        ) : showError ? (
          <ErrorState message={errorMessage} onRetry={onRetry} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-base">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start">نام</th>
                  <th className="p-2 text-start">کد ملی</th>
                  <th className="p-2 text-start">تلفن</th>
                  <th className="p-2 text-start">کد بیمه‌گذار</th>
                  <th className="p-2 text-start">شهر</th>
                  <th className="p-2 text-start">بخش</th>
                  <th className="p-2 text-start">وضعیت</th>
                  <th className="p-2 text-start">کارشناس</th>
                  <th className="p-2 text-start">اقدام</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-border/50">
                    <td className="p-2">
                      <CustomerNameLink customerId={c.id} name={c.fullName} />
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        کد بیمه‌گذار: {displayHolderCode(c.holderCode)}
                      </div>
                    </td>
                    <td className="num p-2 text-xs">{c.nationalId ? toFa(c.nationalId) : "—"}</td>
                    <td className="num p-2 text-xs">{c.phone ? toFa(c.phone) : "—"}</td>
                    <td className="num p-2 text-xs">{displayHolderCode(c.holderCode)}</td>
                    <td className="p-2">{emptyDash(c.city)}</td>
                    <td className="p-2">{c.segment}</td>
                    <td className="p-2">
                      <CustomerBadge status={c.status} />
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{emptyDash(c.agent)}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            to="/customers/$customerId"
                            params={{ customerId: c.id }}
                            hash="edit-customer"
                          >
                            ویرایش
                          </Link>
                        </Button>
                        <RecordActions mobile={c.phone} contextLabel={c.fullName} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                نمایش {toFa(rows.length)} از {toFa(shownTotal)} — صفحه {toFa(safePage + 1)} از{" "}
                {toFa(pageCount)}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  قبلی
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  بعدی
                </Button>
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}
