import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { formatNumber, toFa } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "گزارش‌ها و خروجی‌ها | CRM فصیحی" },
      { name: "description", content: "گزارش‌های مدیریتی فروش، وصول مطالبات و عملکرد کارشناسان با خروجی CSV." },
      { property: "og:title", content: "گزارش‌های مدیریتی" },
      { property: "og:description", content: "تحلیل عملکرد فروش و وصول اقساط دفتر بیمه فصیحی." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { policies, installments, customers } = useStore();

  const byAgent = useMemo(() => {
    const map = new Map<string, { count: number; premium: number; collected: number }>();
    customers.forEach((c) => {
      const entry = map.get(c.agent) ?? { count: 0, premium: 0, collected: 0 };
      entry.count += 1;
      map.set(c.agent, entry);
    });
    policies.forEach((p) => {
      const agent = customers.find((c) => c.id === p.customerId)?.agent;
      if (!agent) return;
      const entry = map.get(agent)!;
      entry.premium += p.premium;
    });
    installments.forEach((i) => {
      const agent = customers.find((c) => c.id === i.customerId)?.agent;
      if (!agent) return;
      map.get(agent)!.collected += i.paidAmount;
    });
    return [...map.entries()].map(([agent, v]) => ({ agent, ...v }));
  }, [customers, policies, installments]);

  const byCompany = useMemo(() => {
    const map = new Map<string, number>();
    policies.forEach((p) => map.set(p.company, (map.get(p.company) ?? 0) + p.premium));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [policies]);

  return (
    <AppShell
      title="گزارش‌ها و خروجی‌ها"
      subtitle="تحلیل عملکرد و وضعیت مالی"
      permission="reports.view"
      actions={
        <Button size="sm" variant="outline" onClick={() => downloadCsv("report-agents.csv", byAgent)}>
          خروجی گزارش کارشناسان
        </Button>
      }
    >
      <SectionCard title="عملکرد کارشناسان فروش">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="p-2 text-start">کارشناس</th>
              <th className="p-2 text-start">تعداد مشتری</th>
              <th className="p-2 text-start">حق بیمه (ریال)</th>
              <th className="p-2 text-start">وصول‌شده (ریال)</th>
            </tr>
          </thead>
          <tbody>
            {byAgent.map((r) => (
              <tr key={r.agent} className="border-b border-border/50">
                <td className="p-2 font-medium">{r.agent}</td>
                <td className="p-2">{toFa(r.count)}</td>
                <td className="num p-2">{formatNumber(r.premium)}</td>
                <td className="num p-2 text-success">{formatNumber(r.collected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="سهم شرکت‌های بیمه از پرتفوی">
        <ul className="space-y-2">
          {byCompany.map(([company, premium]) => {
            const max = byCompany[0][1];
            return (
              <li key={company} className="text-sm">
                <div className="mb-1 flex justify-between">
                  <span>{company}</span>
                  <span className="num text-xs text-muted-foreground">{formatNumber(premium)}</span>
                </div>
                <div className="h-2 rounded-full bg-secondary">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${(premium / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </AppShell>
  );
}
