import { cn } from "@/lib/utils";
import { BRAND, BRAND_ASSETS } from "@/lib/brand";
import { LoginHeroSvg } from "./login-hero-svg";

/**
 * Static fallback for the insurance emblem.
 * Official Karafarin mark — used during SSR, reduced-motion, and missing WebGL.
 * Login hero: cinematic still while 3D loads; SVG when motion is reduced.
 */
export function EmblemFallback({
  className = "",
  variant = "mark",
}: {
  className?: string;
  variant?: "mark" | "hero" | "hero-still" | "hero-svg";
}) {
  const hero = variant === "hero" || variant === "hero-still" || variant === "hero-svg";
  const showSvg = variant === "hero-svg" || variant === "hero";
  const showStill = variant !== "hero-svg";

  if (hero) {
    return (
      <div
        className={cn("relative h-full min-h-dvh w-full overflow-hidden", className)}
        role="img"
        aria-label={`نشان ایستا ${BRAND.insurer} — ${BRAND.loginCodeLine}`}
      >
        {showStill ? (
          <img
            src={BRAND_ASSETS.lux.cubeUmbrella}
            alt=""
            className={cn(
              "absolute inset-0 h-full w-full object-cover object-[18%_center]",
              showSvg ? "opacity-40" : "opacity-90",
            )}
          />
        ) : null}
        <div
          className="absolute inset-0 bg-gradient-to-l from-background via-background/35 to-transparent"
          aria-hidden
        />
        {showSvg ? (
          <LoginHeroSvg className="absolute inset-y-[8%] start-auto end-[6%] h-[84%] w-auto max-w-[min(720px,58vw)] opacity-95 drop-shadow-[0_24px_40px_rgba(0,0,0,0.4)]" />
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn("relative grid place-items-center", className)}
      role="img"
      aria-label={`نشان ${BRAND.insurer}`}
    >
      <div
        className="absolute inset-[8%] rounded-[36%] opacity-50 blur-2xl"
        style={{ background: "var(--gradient-emblem)" }}
        aria-hidden
      />
      <img
        src={BRAND_ASSETS.lux.logo}
        alt=""
        className="emblem-logo-pulse brand-mark relative z-10 h-full w-full max-h-full max-w-full object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
      />
    </div>
  );
}
