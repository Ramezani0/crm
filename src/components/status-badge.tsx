import type { InstallmentStatus, PolicyStatus, CustomerStatus } from "@/lib/types";

const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold";

const tone: Record<string, string> = {
  success: "bg-success/15 text-success border border-success/30",
  warning: "bg-warning/15 text-warning border border-warning/30",
  danger: "bg-destructive/15 text-destructive border border-destructive/30",
  info: "bg-info/15 text-info border border-info/30",
  muted: "bg-muted text-muted-foreground border border-border",
};

export const INSTALLMENT_LABEL: Record<InstallmentStatus, string> = {
  paid: "پرداخت‌شده",
  due: "در انتظار سررسید",
  overdue: "معوق",
  partial: "پرداخت جزئی",
};

const INSTALLMENT_TONE: Record<InstallmentStatus, string> = {
  paid: "success",
  due: "info",
  overdue: "danger",
  partial: "warning",
};

export const POLICY_LABEL: Record<PolicyStatus, string> = {
  active: "فعال",
  expired: "منقضی",
  pending: "در انتظار صدور",
  cancelled: "ابطال‌شده",
};

const POLICY_TONE: Record<PolicyStatus, string> = {
  active: "success",
  expired: "muted",
  pending: "warning",
  cancelled: "danger",
};

export const CUSTOMER_LABEL: Record<CustomerStatus, string> = {
  active: "فعال",
  inactive: "غیرفعال",
  lead: "سرنخ",
};

const CUSTOMER_TONE: Record<CustomerStatus, string> = {
  active: "success",
  inactive: "muted",
  lead: "info",
};

/** Prefer Persian source-file label when present. */
function labelOf(statusLabel: string | undefined, fallback: string) {
  const t = statusLabel?.trim();
  return t && t.length ? t : fallback;
}

export function InstallmentBadge({
  status,
  statusLabel,
}: {
  status: InstallmentStatus;
  statusLabel?: string;
}) {
  return (
    <span className={`${base} ${tone[INSTALLMENT_TONE[status] ?? "muted"]}`}>
      {labelOf(statusLabel, INSTALLMENT_LABEL[status] ?? status)}
    </span>
  );
}

export function PolicyBadge({ status, statusLabel }: { status: PolicyStatus; statusLabel?: string }) {
  return (
    <span className={`${base} ${tone[POLICY_TONE[status] ?? "muted"]}`}>
      {labelOf(statusLabel, POLICY_LABEL[status] ?? status)}
    </span>
  );
}

export function CustomerBadge({ status, statusLabel }: { status: CustomerStatus; statusLabel?: string }) {
  return (
    <span className={`${base} ${tone[CUSTOMER_TONE[status] ?? "muted"]}`}>
      {labelOf(statusLabel, CUSTOMER_LABEL[status] ?? status)}
    </span>
  );
}
