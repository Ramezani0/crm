import { useEffect, useMemo, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { cssVariationVars, hashSeed, sceneVariation, type SceneVariation } from "@/lib/scene-variation";
import { cn } from "@/lib/utils";

export function useLight3dMotion() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setOn(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return on;
}

/** Stable per surface on SSR; entropy applied after mount so scenes differ each visit. */
export function useMountSeed(key: string) {
  const [seed, setSeed] = useState(() => hashSeed(key));
  useEffect(() => {
    const entropy =
      Math.floor(Math.random() * 0xffffffff) ^
      (typeof performance !== "undefined" ? Math.floor(performance.now()) : Date.now());
    setSeed((hashSeed(key) ^ entropy) >>> 0);
  }, [key]);
  return seed;
}

export function useSceneVariation(key: string, index = 0): SceneVariation {
  const seed = useMountSeed(key);
  return useMemo(() => sceneVariation(seed, index), [seed, index]);
}

export function Light3dScene({
  className,
  children,
  variation,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; variation?: SceneVariation }) {
  const merged = {
    ...(variation ? cssVariationVars(variation) : null),
    ...style,
  } as CSSProperties;
  return (
    <div className={cn("l3d-scene", className)} {...props} style={merged}>
      {children}
    </div>
  );
}
