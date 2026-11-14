import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

export function ThemeSwitch({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "روشن" : "تیره";
  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-sm font-medium text-title shadow-sm backdrop-blur-md hover:border-brand-gold/50",
        className,
      )}
      onClick={toggle}
      aria-label={`تغییر به تم ${next}`}
      aria-pressed={theme === "light"}
    >
      <Icon className="size-4" aria-hidden />
      {compact ? null : <span>تم {next}</span>}
    </button>
  );
}
