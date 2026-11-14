import { BRAND_ASSETS } from "@/lib/brand";
import { cn } from "@/lib/utils";

const SIZE: Record<"sm" | "md" | "lg" | "hero", string> = {
  sm: "size-8",
  md: "size-10",
  lg: "size-14",
  hero: "size-28",
};

/** Official Karafarin diamond. Clip to the mark so the PNG’s black field does not show. */
export function BrandMark({
  size = "md",
  className = "",
  alt,
}: {
  size?: keyof typeof SIZE;
  className?: string;
  alt?: string;
}) {
  const src = size === "sm" || size === "md" ? BRAND_ASSETS.logoSm : BRAND_ASSETS.logo;
  return (
    <img
      src={src}
      alt={alt ?? "لوگوی بیمه کارآفرین"}
      className={cn("brand-mark object-contain", SIZE[size], className)}
    />
  );
}
