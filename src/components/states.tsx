import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Lock, WifiOff } from "lucide-react";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="در حال بارگذاری">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-9 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center">
      <Inbox className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-6 py-10 text-center">
      <AlertTriangle className="size-7 text-destructive" aria-hidden />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button type="button" size="sm" onClick={onRetry}>
          تلاش دوباره
        </Button>
      )}
    </div>
  );
}

export function PermissionState({ role }: { role?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-6 py-14 text-center">
      <Lock className="size-7 text-warning" aria-hidden />
      <p className="font-medium">دسترسی به این بخش برای شما مجاز نیست</p>
      <p className="text-sm text-muted-foreground">
        {role ? `نقش فعلی شما: ${role}. ` : ""}برای دریافت دسترسی با مدیر سامانه تماس بگیرید.
      </p>
    </div>
  );
}

export function OfflineBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      <WifiOff className="size-4 text-warning" aria-hidden />
      اتصال اینترنت برقرار نیست؛ تغییرات به‌صورت محلی نگهداری می‌شود.
    </div>
  );
}

export function ApiErrorBanner({
  message,
  onRetry,
}: {
  message?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
      <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
      <span className="min-w-0 flex-1">
        {message || "خواندن /api/data ناموفق بود. دوباره تلاش کنید."}
      </span>
      {onRetry && (
        <Button type="button" size="sm" onClick={onRetry}>
          تلاش دوباره
        </Button>
      )}
    </div>
  );
}

export function MockDataBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-sm">
      <Inbox className="size-4 text-info" aria-hidden />
      /api/data در دسترس نیست — فهرست مشتریان، بیمه‌نامه‌ها و اقساط از دادهٔ نمایشی است. دیتابیس
      زنده دست نخورده می‌ماند.
    </div>
  );
}
