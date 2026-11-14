import type { CSSProperties } from "react";
import { Light3dScene, useLight3dMotion, useSceneVariation } from "./scene";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SalesFunnel3d({
  stages,
}: {
  stages: { stage: string; count: number }[];
}) {
  const motion = useLight3dMotion();
  const variation = useSceneVariation("pipeline-funnel");
  const max = Math.max(1, ...stages.map((s) => s.count));
  const last = Math.max(1, stages.length - 1);

  return (
    <Light3dScene className="px-2 py-4" variation={variation} data-surface="pipeline-funnel">
      <ol className={cn("l3d-funnel", motion && "l3d-funnel-live")} aria-label="قیف فروش سه‌بعدی">
        {stages.map((s, i) => {
          const width = 100 - (i / last) * 42;
          const fill = 22 + (s.count / max) * 78;
          return (
            <li
              key={s.stage}
              className="l3d-funnel-row"
              style={
                {
                  "--funnel-w": `${width}%`,
                  "--funnel-i": String(i),
                  "--funnel-fill": `${fill}%`,
                } as CSSProperties
              }
            >
              <span className="l3d-funnel-label">{s.stage}</span>
              <span className="l3d-funnel-plate">
                <span className="l3d-funnel-fill" />
              </span>
              <span className="num l3d-funnel-count">{formatNumber(s.count)}</span>
            </li>
          );
        })}
      </ol>
    </Light3dScene>
  );
}
