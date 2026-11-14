import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

/**
 * Static SVG of the luxury cube + umbrella showcase.
 * Used when WebGL is off or the user prefers reduced motion.
 */
export function LoginHeroSvg({ className = "" }: { className?: string }) {
  return (
    <svg
      className={cn("login-hero-svg", className)}
      viewBox="0 0 640 480"
      role="img"
      aria-label={`صحنه ایستا — مکعب‌های بیمه زیر چتر ${BRAND.insurer}`}
    >
      <defs>
        <linearGradient id="lux-canopy" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0b8a4e" />
          <stop offset="55%" stopColor="#007440" />
          <stop offset="100%" stopColor="#0b5a32" />
        </linearGradient>
        <linearGradient id="lux-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe08a" />
          <stop offset="50%" stopColor="#fcbc00" />
          <stop offset="100%" stopColor="#c49200" />
        </linearGradient>
        <linearGradient id="lux-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d7f3ff" stopOpacity="0.92" />
          <stop offset="100%" stopColor="#7ecad8" stopOpacity="0.78" />
        </linearGradient>
        <linearGradient id="lux-marble" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a2e28" />
          <stop offset="100%" stopColor="#121410" />
        </linearGradient>
        <filter id="lux-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#000" floodOpacity="0.45" />
        </filter>
      </defs>

      <ellipse cx="320" cy="392" rx="168" ry="22" fill="#000" opacity="0.28" />

      <g filter="url(#lux-soft)">
        <rect x="168" y="348" width="304" height="28" rx="4" fill="url(#lux-marble)" />
        <rect x="166" y="344" width="308" height="8" rx="2" fill="url(#lux-gold)" />
        <rect x="196" y="322" width="248" height="24" rx="4" fill="url(#lux-marble)" />
        <rect x="194" y="318" width="252" height="7" rx="2" fill="url(#lux-gold)" />
      </g>

      <g transform="translate(320 248)">
        <g transform="translate(-52 -52)">{cube("M-18 4h36v14h-36zM-10-12h8v16h-8zM-14 20a6 6 0 1 0 0.01 0zm28 0a6 6 0 1 0 0.01 0z")}</g>
        <g transform="translate(52 -52)">{cube("M0-22 L22-6 V22 H-22 V-6 Z")}</g>
        <g transform="translate(-52 52)">{cube("M0 18 C-28 2-24-22 0-10 C24-22 28 2 0 18Z")}</g>
        <g transform="translate(52 52)">
          {cube(
            "M-10-16a8 8 0 1 0 0.01 0zM10-12a7 7 0 1 0 0.01 0zM-22 20c-2-18 8-26 12-26s14 8 12 26zM2 22c-2-16 6-22 10-22s12 6 10 22z",
          )}
        </g>
      </g>

      <g transform="translate(320 86)">
        <ellipse cx="0" cy="86" rx="168" ry="36" fill="url(#lux-canopy)" />
        <path
          d="M-168 86 C-140 8 -80 -28 0 -28 C80 -28 140 8 168 86 Z"
          fill="url(#lux-canopy)"
          stroke="#0b5a32"
          strokeWidth="3"
        />
        {Array.from({ length: 7 }, (_, i) => {
          const t = (i / 6) * Math.PI - Math.PI / 2;
          const x = Math.sin(t) * 160;
          const y = 86 - Math.cos(t) * 18;
          return <line key={i} x1="0" y1="-20" x2={x} y2={y} stroke="#0b5a32" strokeWidth="2" opacity="0.45" />;
        })}
        <rect x="-5" y="-28" width="10" height="268" rx="4" fill="url(#lux-gold)" />
        <path d="M5 236 C28 236 36 258 18 268 C4 274 -6 262 -5 248" fill="none" stroke="url(#lux-gold)" strokeWidth="8" />
      </g>
    </svg>
  );
}

function cube(icon: string) {
  return (
    <>
      <rect x="-44" y="-44" width="88" height="88" rx="14" fill="url(#lux-glass)" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" />
      <path d={icon} fill="#fff" transform="translate(0 4) scale(1.15)" />
    </>
  );
}
