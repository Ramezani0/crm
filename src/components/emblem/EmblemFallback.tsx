/**
 * Static, dependency-free fallback emblem.
 * Rendered during SSR, while the animated emblem chunk loads, and whenever
 * the user prefers reduced motion.
 */
export function EmblemFallback({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="نشان بیمه فصیحی" className={className}>
      <defs>
        <linearGradient id="fx-shield" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.13 178)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="oklch(0.62 0.14 200)" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="fx-umbrella" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.82 0.15 158)" />
          <stop offset="100%" stopColor="oklch(0.6 0.13 170)" />
        </linearGradient>
      </defs>
      <path
        d="M100 16 L168 44 V102 C168 142 138 170 100 184 C62 170 32 142 32 102 V44 Z"
        fill="url(#fx-shield)"
        stroke="oklch(0.85 0.1 178)"
        strokeOpacity="0.55"
        strokeWidth="2"
      />
      <path
        d="M100 16 L168 44 V102 C168 142 138 170 100 184 Z"
        fill="oklch(0.15 0.04 250)"
        fillOpacity="0.18"
      />
      <path d="M56 106 C56 82 76 64 100 64 C124 64 144 82 144 106 Z" fill="url(#fx-umbrella)" />
      <path
        d="M56 106 C68 96 78 106 90 106 C102 106 108 96 122 106"
        fill="none"
        stroke="oklch(0.2 0.04 250)"
        strokeOpacity="0.35"
        strokeWidth="3"
      />
      <path
        d="M100 64 V138 a12 12 0 0 1-24 0"
        fill="none"
        stroke="oklch(0.95 0.02 200)"
        strokeOpacity="0.85"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <g stroke="oklch(0.85 0.15 158)" strokeWidth="4" strokeLinecap="round" opacity="0.9">
        <path d="M118 150 L118 132" />
        <path d="M132 150 L132 122" />
        <path d="M146 150 L146 112" />
      </g>
    </svg>
  );
}
