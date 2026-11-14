import { Light3dScene, useLight3dMotion, useSceneVariation } from "./scene";
import { cn } from "@/lib/utils";

export function KpiOrb({
  tone = "emerald",
  label,
  index = 0,
}: {
  tone?: "emerald" | "gold" | "warn";
  label: string;
  index?: number;
}) {
  const motion = useLight3dMotion();
  const variation = useSceneVariation(`dashboard-kpi:${label}`, index);
  return (
    <Light3dScene
      className="grid size-14 shrink-0 place-items-center"
      variation={variation}
      data-surface="dashboard-kpi"
      aria-hidden
    >
      <div className={cn("l3d-kpi", motion && "l3d-kpi-live")} data-tone={tone} title={label}>
        <span className="l3d-kpi-ring" />
        <span className="l3d-kpi-gem" />
        <span className="l3d-ribbon" data-ribbon={variation.ribbon} />
      </div>
    </Light3dScene>
  );
}
