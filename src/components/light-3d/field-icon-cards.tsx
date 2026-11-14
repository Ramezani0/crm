import type { CSSProperties } from "react";
import { Light3dScene, useLight3dMotion, useSceneVariation } from "./scene";
import { FIELD_CARD_ACCENTS, FIELD_CARD_KINDS, LINE_CARD_EXTRAS } from "@/lib/light-3d";
import { LUX_ART } from "@/lib/brand";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LuxStill } from "@/components/lux-still";

export function FieldIconCards({
  counts,
  installmentCount = 0,
}: {
  counts: Record<string, number>;
  installmentCount?: number;
}) {
  const motion = useLight3dMotion();
  return (
    <div className="space-y-3">
      <LuxStill
        src={LUX_ART.lineCards}
        alt="رشته‌های بیمه"
        className="h-28 w-full rounded-2xl object-cover object-center ring-1 ring-border/60 sm:h-36"
      />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {FIELD_CARD_KINDS.map((kind, i) => {
          const accent = FIELD_CARD_ACCENTS[kind];
          return (
            <FieldCard
              key={kind}
              kind={kind}
              count={counts[kind] ?? 0}
              unit="بیمه‌نامه"
              art={LUX_ART[accent.art]}
              shape={accent.shape}
              tone={accent.tone}
              index={i}
              motion={motion}
            />
          );
        })}
        {LINE_CARD_EXTRAS.map((extra, i) => {
          const count =
            extra.art === "installments"
              ? installmentCount
              : extra.art === "home"
                ? (counts["آتش‌سوزی"] ?? 0)
                : (counts[extra.kind] ?? 0);
          return (
            <FieldCard
              key={extra.kind}
              kind={extra.kind}
              count={count}
              unit={extra.unit}
              art={LUX_ART[extra.art]}
              shape={extra.shape}
              tone={extra.tone}
              index={FIELD_CARD_KINDS.length + i}
              motion={motion}
            />
          );
        })}
      </ul>
    </div>
  );
}

function FieldCard({
  kind,
  count,
  unit,
  art,
  shape,
  tone,
  index,
  motion,
}: {
  kind: string;
  count: number;
  unit: string;
  art: string;
  shape: string;
  tone: "emerald" | "gold" | "warn";
  index: number;
  motion: boolean;
}) {
  const variation = useSceneVariation(`insurance-field:${kind}`, index);
  return (
    <li>
      <Light3dScene variation={variation} data-surface="insurance-field-cards">
        <article
          className={cn("glass l3d-field-card flex items-center gap-3 rounded-2xl p-4", motion && "l3d-field-card-live")}
          style={{ "--l3d-index": String(index) } as CSSProperties}
        >
          <LuxStill
            src={art}
            alt=""
            decorative
            className="size-16 shrink-0 rounded-xl object-cover ring-1 ring-brand-gold/30"
          />
          <span
            className={cn("l3d-field-icon sr-only", motion && "l3d-field-icon-live")}
            data-shape={shape}
            data-kind={tone}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="font-bold text-title">{kind}</p>
            <p className="num text-sm text-muted-foreground">
              {formatNumber(count)} {unit}
            </p>
          </div>
        </article>
      </Light3dScene>
    </li>
  );
}
