import { BrandMark } from "@/components/brand-mark";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function BrandFooter({ className = "" }: { className?: string }) {
  return (
    <footer
      className={cn(
        "flex items-center justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground",
        className,
      )}
    >
      <BrandMark size="sm" className="size-5 shrink-0" />
      <span>{BRAND.footer}</span>
    </footer>
  );
}
