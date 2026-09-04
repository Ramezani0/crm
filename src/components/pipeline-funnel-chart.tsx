import { useMemo } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "@/lib/store";
import { compactRial, formatNumber } from "@/lib/format";
import { LOST_STAGE, PIPELINE_STAGES } from "@/lib/types";
import { weighted } from "./pipeline/pipeline-utils";

const COLORS = ["#38bdf8", "#22d3ee", "#2dd4bf", "#34d399", "#4ade80", "#10b981"];

/** Code-split funnel chart for the dashboard. */
export default function PipelineFunnelChart() {
  const { opportunities } = useStore();

  const { data, openCount, weightedValue } = useMemo(() => {
    const open = opportunities.filter((o) => o.stage !== LOST_STAGE);
    return {
      data: PIPELINE_STAGES.map((s) => {
        const items = open.filter((o) => o.stage === s);
        return { stage: s, count: items.length, value: items.reduce((x, o) => x + o.expectedPremium, 0) };
      }),
      openCount: open.length,
      weightedValue: weighted(open),
    };
  }, [opportunities]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        <div>
          <p className="text-[11px] text-muted-foreground">فرصت‌های باز</p>
          <p className="num text-lg font-extrabold">{formatNumber(openCount)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">ارزش وزنی قیف</p>
          <p className="num text-lg font-extrabold">{compactRial(weightedValue)} ریال</p>
        </div>
      </div>
      <div className="h-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ right: 8, left: 8 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="stage"
              width={92}
              tick={{ fontSize: 11, fill: "currentColor" }}
              axisLine={false}
              tickLine={false}
              orientation="right"
            />
            <Tooltip
              formatter={(v: number, _n, p) => [`${formatNumber(v)} فرصت — ${compactRial(p.payload.value)} ریال`, ""]}
              contentStyle={{ direction: "rtl", fontSize: 12 }}
            />
            <Bar dataKey="count" radius={6}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
