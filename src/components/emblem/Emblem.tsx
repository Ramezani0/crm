import { Suspense, lazy, useEffect, useState } from "react";
import { EmblemFallback } from "./EmblemFallback";

const AnimatedEmblem = lazy(() => import("./AnimatedEmblem"));

/**
 * Client-only, code-split mount point for the emblem.
 * SSR and the loading state render the static SVG so there is no layout shift
 * and no animation cost on operational pages (this component is only used on
 * the login screen and the dashboard hero).
 */
export function Emblem({ className = "" }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <EmblemFallback className={`w-full max-w-[280px] ${className}`} />;

  return (
    <Suspense fallback={<EmblemFallback className={`w-full max-w-[280px] ${className}`} />}>
      <AnimatedEmblem className={className} />
    </Suspense>
  );
}
