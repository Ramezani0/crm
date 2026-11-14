import { cn } from "@/lib/utils";

/** Static lux still — never loads Three.js. */
export function LuxStill({
  src,
  alt,
  className = "",
  decorative = false,
}: {
  src: string;
  alt: string;
  className?: string;
  decorative?: boolean;
}) {
  return (
    <img
      src={src}
      alt={decorative ? "" : alt}
      className={cn("lux-still", className)}
      decoding="async"
    />
  );
}

export function LuxOrnament({ src, className = "" }: { src: string; className?: string }) {
  return (
    <img
      src={src}
      alt=""
      className={cn("lux-ornament", className)}
      decoding="async"
      aria-hidden
    />
  );
}
