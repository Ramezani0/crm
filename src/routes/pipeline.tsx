import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { CustomerNameLink } from "@/components/customer-name-link";
import { SalesFunnel3d } from "@/components/light-3d/sales-funnel";
import { LuxOrnament } from "@/components/lux-still";
import { useStore } from "@/lib/store";
import { BRAND, LUX_ART } from "@/lib/brand";
import { PIPELINE_STAGES, LOST_STAGE } from "@/lib/types";
import { formatNumber, toFa } from "@/lib/format";

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: `پایپلاین | ${BRAND.title}` },
      { name: "description", content: "قیف فروش نمایندگی ۳۰۴۵ — اسکلت فاز ۱." },
    ],
  }),
  component: PipelinePage,
});

function PipelinePage() {
  const { opportunities } = useStore();
  const stages = [...PIPELINE_STAGES, LOST_STAGE];
  const funnel = useMemo(
    () =>
      PIPELINE_STAGES.map((stage) => ({
        stage,
        count: opportunities.filter((o) => o.stage === stage).length,
      })),
    [opportunities],
  );

  return (
    <AppShell title="پایپلاین" subtitle="اسکلت فاز ۱ با فرصت‌های نمایشی" permission="pipeline.view">
      <SectionCard title="قیف فروش سه‌بعدی" description="سطح سبک CSS — بدون WebGL روی فهرست فرصت‌ها">
        <div className="relative overflow-hidden rounded-2xl">
          <LuxOrnament src={LUX_ART.dashboard} />
          <div className="relative z-[1]">
            <SalesFunnel3d stages={funnel} />
          </div>
        </div>
      </SectionCard>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stages.map((stage) => {
          const items = opportunities.filter((o) => o.stage === stage);
          const premium = items.reduce((s, o) => s + o.expectedPremium, 0);
          return (
            <SectionCard key={stage} title={stage} description={`${toFa(items.length)} فرصت · ${formatNumber(premium)} ریال`}>
              <ul className="space-y-2">
                {items.slice(0, 4).map((o) => (
                  <li key={o.id} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <p>
                      <CustomerNameLink customerId={o.customerId} name={o.contactName} />
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {o.product} — {o.owner}
                    </p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          );
        })}
      </div>
    </AppShell>
  );
}
