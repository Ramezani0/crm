import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectionCard } from "./app-shell";
import { useStore } from "@/lib/store";
import { compactRial } from "@/lib/format";

const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

/** Code-split chart bundle: recharts never loads on operational pages. */
export default function DashboardCharts() {
  const { installments, policies } = useStore();

  const monthly = useMemo(
    () =>
      MONTHS.map((m, idx) => {
        const bucket = installments.filter((i) => new Date(i.dueDate).getUTCMonth() === idx);
        return {
          name: m,
          وصول: Math.round(bucket.reduce((s, i) => s + i.paidAmount, 0) / 1_000_000),
          مطالبات: Math.round(bucket.reduce((s, i) => s + (i.amount - i.paidAmount), 0) / 1_000_000),
        };
      }),
    [installments],
  );

  const byKind = useMemo(() => {
    const map = new Map<string, number>();
    policies.forEach((p) => map.set(p.kind, (map.get(p.kind) ?? 0) + 1));
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [policies]);

  const statusData = useMemo(() => {
    const labels: Record<string, string> = {
      paid: "پرداخت‌شده",
      due: "در انتظار",
      overdue: "معوق",
      partial: "جزئی",
    };
    return Object.entries(labels).map(([k, name]) => ({
      name,
      تعداد: installments.filter((i) => i.status === k).length,
    }));
  }, [installments]);

  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--info)"];
  const axis = { stroke: "var(--muted-foreground)", fontSize: 11 } as const;
  const tooltipStyle = {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    fontSize: 12,
  };

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <SectionCard title="روند وصول و مطالبات" description="میلیون ریال به تفکیک ماه" className="xl:col-span-2">
        <div className="h-64" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.55} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-4)" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="var(--chart-4)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="وصول" stroke="var(--chart-1)" fill="url(#g1)" strokeWidth={2} />
              <Area type="monotone" dataKey="مطالبات" stroke="var(--chart-4)" fill="url(#g2)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="ترکیب رشته‌های بیمه‌ای">
        <div className="h-64" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={byKind} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={3}>
                {byKind.map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="وضعیت اقساط" className="xl:col-span-3">
        <div className="h-56" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="تعداد" radius={[8, 8, 0, 0]}>
                {statusData.map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          مجموع مبالغ وصول‌شده: {compactRial(installments.reduce((s, i) => s + i.paidAmount, 0))} ریال
        </p>
      </SectionCard>
    </div>
  );
}
