import { useEffect, useRef, useState } from "react";
import { EmblemFallback } from "./EmblemFallback";

/**
 * Animated 3D-ish insurance emblem built with pure CSS 3D transforms + SVG.
 * No Three.js, no WebGL, ~2KB of runtime. Animation pauses when the emblem is
 * off-screen or the tab is hidden, and is skipped for prefers-reduced-motion.
 */
export default function AnimatedEmblem({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setActive(false);
      return;
    }
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting && !document.hidden), {
      threshold: 0.15,
    });
    io.observe(el);
    const onVis = () => setActive(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const state = active ? "running" : "paused";

  return (
    <div
      ref={ref}
      className={`relative isolate grid place-items-center ${className}`}
      style={{ perspective: "900px" }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-6 rounded-full opacity-40 blur-2xl"
        style={{
          background: "var(--gradient-emblem)",
          animation: "emblem-spin 26s linear infinite",
          animationPlayState: state,
        }}
      />
      <div
        className="relative w-full max-w-[280px]"
        style={{
          transformStyle: "preserve-3d",
          animation: "emblem-float 7s ease-in-out infinite",
          animationPlayState: state,
        }}
      >
        <div
          className="absolute inset-0 rounded-[36%] opacity-70"
          style={{
            background: "linear-gradient(160deg, color-mix(in oklab, var(--primary) 30%, transparent), transparent 65%)",
            transform: "translateZ(-40px) scale(0.92)",
            filter: "blur(14px)",
          }}
        />
        <EmblemFallback className="relative w-full drop-shadow-[0_18px_40px_rgba(0,0,0,0.45)]" />
        <div
          className="pointer-events-none absolute inset-0 rounded-[38%]"
          style={{
            background:
              "linear-gradient(120deg, color-mix(in oklab, white 22%, transparent) 0%, transparent 42%)",
            mixBlendMode: "screen",
            transform: "translateZ(30px)",
          }}
        />
      </div>
    </div>
  );
}
