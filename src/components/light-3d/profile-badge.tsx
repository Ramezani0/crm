import { Light3dScene, useLight3dMotion, useSceneVariation } from "./scene";
import { BRAND_ASSETS } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Small shield emblem for پرونده header — never mounted on tables. */
export function ProfileBadge3d({
  name,
  compact = false,
}: {
  name: string;
  compact?: boolean;
}) {
  const motion = useLight3dMotion();
  const variation = useSceneVariation(`dossier-profile:${name}`);
  const initial = name.trim().slice(0, 1) || "؟";
  return (
    <Light3dScene
      className={cn("grid shrink-0 place-items-center", compact ? "size-10" : "size-[4.75rem]")}
      variation={variation}
      data-surface="dossier-profile"
    >
      <div
        className={cn("l3d-shield", compact && "l3d-shield-sm", motion && "l3d-shield-live")}
        title={name}
      >
        <span className="l3d-shield-plate">
          <img src={BRAND_ASSETS.lux.badge} alt="" className="l3d-shield-logo" />
        </span>
        <span className="l3d-shield-initial">{initial}</span>
      </div>
    </Light3dScene>
  );
}
