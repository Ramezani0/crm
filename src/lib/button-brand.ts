import { useCallback, useEffect, useRef, useState } from "react";

/**
 * CTA + nav button feedback — DESIGN_EMERALD_GOLD.md.
 * Hover: soft gold glow ~150ms (CSS).
 * Click: random gold / emerald / forest flash ~200ms. Danger is never a flash tone.
 * Scope: .btn-cta only (shadcn default/secondary/outline + sidebar/mobile nav + logout).
 */

export const BRAND_BUTTON_FLASH_TONES = ["gold", "emerald", "forest"] as const;

export type BrandButtonFlashTone = (typeof BRAND_BUTTON_FLASH_TONES)[number];

export const BUTTON_HOVER_MS = 150;
export const BUTTON_FLASH_MS = 200;

export const CTA_BUTTON_CLASS = "btn-cta";

export function isCtaButtonVariant(
  variant:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | null
    | undefined,
): boolean {
  return variant == null || variant === "default" || variant === "secondary" || variant === "outline";
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function pickBrandButtonFlashTone(): BrandButtonFlashTone {
  return BRAND_BUTTON_FLASH_TONES[Math.floor(Math.random() * BRAND_BUTTON_FLASH_TONES.length)]!;
}

export function useBrandButtonFlash(enabled = true) {
  const [flash, setFlash] = useState<BrandButtonFlashTone | null>(null);
  const timerRef = useRef<number | null>(null);

  const triggerFlash = useCallback(() => {
    if (!enabled || prefersReducedMotion()) return;
    setFlash(pickBrandButtonFlashTone());
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setFlash(null);
      timerRef.current = null;
    }, BUTTON_FLASH_MS);
  }, [enabled]);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return { flash, triggerFlash };
}
