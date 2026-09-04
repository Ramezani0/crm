import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { useDebounced, useStore } from "@/lib/store";
import { POLICY_LABEL, PolicyBadge } from "@/components/status-badge";
import { formatDate, formatNumber, toFa } from "@/lib/format";
import { displayDate, displayText } from "@/lib/display";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";
import { EmptyState, TableSkeleton } from "@/components/states";

export const Route = createFileRoute("/policies")({
  head: () => ({
    meta: [
      { title: "بیمه‌نامه‌ها | CRM فصیحی" },
      { name: "description", content: "مدیریت بیمه‌نامه‌های صادرشده، وضعیت اعتبار، شرکت بیمه‌گر و حق بیمه." },
      { property: "og:title", content: "مدیریت بیمه‌نامه‌ها" },
      { property: "og:description", content: "فهرست بیمه‌نامه‌های فعال، منقضی و در انتظار صدور." },
    ],
  }),
  component: PoliciesPage,
});

function PoliciesPage() {
  const { policies, customers, hydrated } = useStore();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const q = useDebounced(search, 300);

  const name = (p: { customerId: string; holderName?: string }) =>
    displayText(p.holderName) !== "—"
      ? displayText(p.holderName)
      : displayText(customers.find((c) => c.id === p.customerId)?.fullName);
  const kinds = useMemo(() => [...new Set(policies.map((p) => p.kind))], [policies]);

  const filtered = useMemo(
    () =>
      policies.filter(
        (p) =>
          (kind === "all" || p.kind === kind) &&
          (status === "all" || p.status === status) &&
          (!q.trim() || p.number.includes(q.trim()) || name(p).includes(q.trim())),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [policies, q, kind, status, customers],
  );

  const rows = filtered.slice((page - 1) * 12, page * 12);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
  const selectClass = "h-9 rounded-md border border-input bg-card px-3 text-sm";

  return (
    <AppShell
      title="بیمه‌نامه‌ها"
      subtitle={`${formatNumber(filtered.length)} بیمه‌نامه`}
      permission="policies.view"
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            downloadCsv(
              "policies.csv",
              filtered.map((p) => ({
                شماره: p.number,
                بیمه‌گذار: name(p),
                رشته: p.kind,
                شرکت: p.company,
                حق_بیمه: p.premium,
                وضعیت: p.statusLabel?.trim() || POLICY_LABEL[p.status],
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
            placeholder="شماره بیمه‌نامه یا نام بیمه‌گذار…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="جست‌وجوی بیمه‌نامه"
          />
          <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="رشته بیمه">
            <option value="all">همه رشته‌ها</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="وضعیت">
            <option value="all">همه وضعیت‌ها</option>
            <option value="active">فعال</option>
            <option value="expired">منقضی</option>
            <option value="pending">در انتظار صدور</option>
            <option value="cancelled">ابطال‌شده</option>
          </select>
        </div>
      </SectionCard>

      <SectionCard>
        {!hydrated ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState title="بیمه‌نامه‌ای یافت نشد" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start">شماره</th>
                  <th className="p-2 text-start">بیمه‌گذار</th>
                  <th className="p-2 text-start">رشته</th>
                  <th className="p-2 text-start">شرکت</th>
                  <th className="p-2 text-start">حق بیمه (ریال)</th>
                  <th className="p-2 text-start">اعتبار</th>
                  <th className="p-2 text-start">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/40">
                    <td className="num p-2 text-xs">{displayText(p.number === "" ? "" : toFa(p.number))}</td>
                    <td className="p-2 font-medium">{name(p)}</td>
                    <td className="p-2">{displayText(p.kind)}</td>
                    <td className="p-2 text-xs text-muted-foreground">{displayText(p.company)}</td>
                    <td className="num p-2">{formatNumber(p.premium)}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {displayDate(p.startDate, formatDate)} تا {displayDate(p.endDate, formatDate)}
                    </td>
                    <td className="p-2">
                      <PolicyBadge status={p.status} statusLabel={p.statusLabel} />
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
    </AppShell>
  );
}
