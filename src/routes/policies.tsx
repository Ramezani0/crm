import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, SectionCard } from "@/components/app-shell";
import { CustomerNameLink, PolicyDossierLink } from "@/components/customer-name-link";
import { ErrorState, TableSkeleton } from "@/components/states";
import { PolicyBadge } from "@/components/status-badge";
import { RecordActions } from "@/components/record-actions";
import { Input } from "@/components/ui/input";
import { fetchPoliciesLite } from "@/lib/api";
import { useStore, useDebounced } from "@/lib/store";
import { BRAND } from "@/lib/brand";
import { crmPageSubtitle, crmSourceCaption } from "@/lib/crm-source";
import { dossierCustomerId, matchesDossierQuery, policyDisplayNumber } from "@/lib/dossier";
import {
  displayHolderCode,
  emptyDash,
  formatDate,
  formatNumber,
  parseJalaliYearMonth,
  toFa,
} from "@/lib/format";
import { mapPolicy } from "@/lib/map-api-data";
import type { Policy } from "@/lib/types";

export const Route = createFileRoute("/policies")({
  head: () => ({
    meta: [
      { title: `بیمه‌نامه‌ها | ${BRAND.title}` },
      { name: "description", content: "پرتفوی بیمه‌نامه نمایندگی ۳۰۴۵." },
    ],
  }),
  component: PoliciesPage,
});

function PoliciesPage() {
  const { policies, customers, crmSource, crmError, retryCrmData } = useStore();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 200);
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [page, setPage] = useState(0);
  const [litePolicies, setLitePolicies] = useState<Policy[]>([]);
  const [liteTotal, setLiteTotal] = useState(0);
  const [liteError, setLiteError] = useState<string | null>(null);
  const [litePending, setLitePending] = useState(true);

  const usingStore = policies.length > 0;
  const year = selectedYear ? Number(selectedYear) : undefined;
  const month = selectedMonth ? Number(selectedMonth) : undefined;
  const pageSize = 24;

  useEffect(() => {
    if (usingStore) {
      setLitePending(false);
      return;
    }
    let cancelled = false;
    setLitePending(true);
    fetchPoliciesLite(pageSize, page * pageSize, dq.trim(), { year, month })
      .then((res) => {
        if (cancelled) return;
        setLitePolicies(res.data.policies.map((row, i) => mapPolicy(row, page * pageSize + i)));
        setLiteTotal(res.data.total);
        setLiteError(null);
        setLitePending(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLiteError(err instanceof Error ? err.message : "خواندن فهرست بیمه‌نامه‌ها ناموفق بود.");
        setLitePending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dq, month, page, usingStore, year]);

  useEffect(() => {
    setPage(0);
  }, [dq, month, selectedYear, selectedMonth, usingStore]);

  const list = usingStore ? policies : litePolicies;
  const nameOf = useCallback(
    (id: string) => customers.find((c) => c.id === id)?.fullName,
    [customers],
  );
  const filtered = useMemo(
    () =>
      list.filter((p) => {
        const queryMatches = matchesDossierQuery(dq, [
          p.number,
          p.computerCode,
          p.kind,
          p.kindRaw,
          p.company,
          p.holderName,
          p.holderCode,
          nameOf(p.customerId),
          p.customerId,
        ]);
        if (!queryMatches) return false;
        const ym = parseJalaliYearMonth(p.endDate);
        return (!year || ym?.year === year) && (!month || ym?.month === month);
      }),
    // nameOf is derived from customers in the same render
    [list, dq, month, nameOf, year],
  );
  const rows = usingStore ? filtered.slice(page * pageSize, (page + 1) * pageSize) : filtered;
  const shownTotal = usingStore ? filtered.length : liteTotal;
  const pageCount = Math.max(1, Math.ceil(shownTotal / pageSize));
  const pending = usingStore
    ? crmSource === "pending" && policies.length === 0
    : litePending && list.length === 0;
  const failed = usingStore
    ? crmSource === "error" && policies.length === 0
    : Boolean(liteError) && list.length === 0;
  const currentJalaliYear = Number(
    new Intl.DateTimeFormat("en-US-u-ca-persian", { year: "numeric", timeZone: "UTC" }).format(
      new Date(),
    ),
  );
  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    for (let offset = 0; offset <= 5; offset += 1) years.add(currentJalaliYear - offset);
    for (const p of list) {
      const ym = parseJalaliYearMonth(p.endDate);
      if (ym) years.add(ym.year);
    }
    return [...years].filter((value) => value >= 1300).sort((a, b) => b - a);
  }, [currentJalaliYear, list]);
  const monthOptions = [
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
  ];

  return (
    <AppShell title="بیمه‌نامه‌ها" subtitle={crmPageSubtitle(crmSource)} permission="policies.view">
      <SectionCard
        title="بیمه‌نامه‌ها"
        description={`${crmSourceCaption(crmSource, shownTotal, "بیمه‌نامه")} — روی شماره یا نام بزنید`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجوی شماره، رشته، نام…"
              className="w-56"
              aria-label="جستجوی بیمه‌نامه"
            />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="فیلتر سال پایان پوشش"
            >
              <option value="">همه سال‌ها</option>
              {yearOptions.map((value) => (
                <option key={value} value={value}>
                  {toFa(value)}
                </option>
              ))}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="فیلتر ماه پایان پوشش"
            >
              <option value="">همه ماه‌ها</option>
              {monthOptions.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {pending ? (
          <TableSkeleton rows={8} cols={6} />
        ) : failed ? (
          <ErrorState
            message={liteError || crmError || "خواندن /api/data ناموفق بود."}
            onRetry={retryCrmData}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-base">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="p-2 text-start">شماره</th>
                    <th className="p-2 text-start">بیمه‌گذار</th>
                    <th className="p-2 text-start">رشته</th>
                    <th className="p-2 text-start">شرکت</th>
                    <th className="p-2 text-start">حق‌بیمه</th>
                    <th className="p-2 text-start">پایان</th>
                    <th className="p-2 text-start">کد بیمه‌گذار</th>
                    <th className="p-2 text-start">وضعیت</th>
                    <th className="p-2 text-start">اقدام</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const cid = dossierCustomerId({ customerId: p.customerId });
                    return (
                      <tr key={p.id} className="border-b border-border/50">
                        <td className="p-2">
                          <PolicyDossierLink
                            customerId={cid}
                            label={policyDisplayNumber(p)}
                            policyId={p.id}
                          />
                        </td>
                        <td className="p-2">
                          <CustomerNameLink customerId={cid} name={nameOf(p.customerId)} />
                        </td>
                        <td className="p-2">{emptyDash(p.kind)}</td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {emptyDash(p.company)}
                        </td>
                        <td className="num p-2">{formatNumber(p.premium)}</td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {formatDate(p.endDate)}
                        </td>
                        <td className="num p-2 text-xs">
                          {displayHolderCode(
                            p.holderCode ||
                              customers.find((c) => c.id === p.customerId)?.holderCode,
                          )}
                        </td>
                        <td className="p-2">
                          <PolicyBadge status={p.status} />
                        </td>
                        <td className="p-2">
                          <RecordActions
                            mobile={customers.find((c) => c.id === cid)?.phone}
                            contextLabel={nameOf(p.customerId) || policyDisplayNumber(p)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  بیمه‌نامه‌ای با این فیلترها پیدا نشد.
                </p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <p>
                نمایش {toFa(rows.length)} از {toFa(shownTotal)}
                {!usingStore && " — دادهٔ صفحه‌ای از /api/policies/lite"}
              </p>
              <nav className="flex items-center gap-2" aria-label="صفحه‌بندی بیمه‌نامه‌ها">
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                  disabled={page === 0}
                >
                  قبلی
                </button>
                <span>
                  صفحه {toFa(page + 1)} از {toFa(pageCount)}
                </span>
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                  disabled={page >= pageCount - 1}
                >
                  بعدی
                </button>
              </nav>
            </div>
          </>
        )}
      </SectionCard>
    </AppShell>
  );
}
