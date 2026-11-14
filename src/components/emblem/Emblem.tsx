import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { EmblemFallback } from "./EmblemFallback";
import { cn } from "@/lib/utils";

const InsuranceScene = lazy(() => import("./InsuranceScene"));

class WebGLGuard extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("Fasihi 3D emblem fell back to SVG", error, info.componentStack);
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

function canCreateWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Client-only mount for the insurance emblem.
 * Three/R3F is dynamically imported and never loaded on operational pages,
 * when WebGL is unavailable, or when the user prefers reduced motion.
 */
export function Emblem({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<"ssr" | "static" | "3d">("ssr");

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMode(reduced || !canCreateWebGL() ? "static" : "3d");
  }, []);

  const fallback = compact ? (
    <EmblemFallback variant="mark" className={cn("w-full max-w-[224px]", className)} />
  ) : (
    <EmblemFallback
      variant={mode === "static" ? "hero-svg" : "hero-still"}
      className={cn("h-full min-h-dvh w-full", className)}
    />
  );

  if (mode !== "3d") return fallback;

  return (
    <WebGLGuard fallback={fallback}>
      <Suspense fallback={fallback}>
        <InsuranceScene className={className} compact={compact} />
      </Suspense>
    </WebGLGuard>
  );
}
