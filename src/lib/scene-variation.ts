/** Micro-variation so CSS-3D / login scenes are not identical clones on every mount. */

export const RIBBON_KINDS = ["wave", "fold", "orbit", "flare"] as const;

export type RibbonKind = (typeof RIBBON_KINDS)[number];

export type SceneVariation = {
  seed: number;
  delayMs: number;
  durationMs: number;
  tiltX: number;
  tiltY: number;
  pulse: number;
  phase: number;
  ribbon: RibbonKind;
};

export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sceneVariation(seed: number, index = 0): SceneVariation {
  const rng = mulberry32(seed ^ Math.imul(index + 1, 2654435761));
  return {
    seed,
    delayMs: Math.round(rng() * 1600),
    durationMs: 6400 + Math.round(rng() * 4800),
    tiltX: 5 + rng() * 9,
    tiltY: -14 + rng() * 28,
    pulse: 0.03 + rng() * 0.05,
    phase: rng(),
    ribbon: RIBBON_KINDS[Math.floor(rng() * RIBBON_KINDS.length)]!,
  };
}

export function cssVariationVars(v: SceneVariation): Record<string, string> {
  return {
    "--l3d-delay": `${v.delayMs}ms`,
    "--l3d-duration": `${v.durationMs}ms`,
    "--l3d-tilt-x": `${v.tiltX.toFixed(2)}deg`,
    "--l3d-tilt-y": `${v.tiltY.toFixed(2)}deg`,
    "--l3d-pulse": (1 + v.pulse).toFixed(3),
    "--l3d-phase": v.phase.toFixed(3),
  };
}
