import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { emptyDash } from "@/lib/format";

const linkClass =
  "rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CustomerNameLink({
  customerId,
  name,
  className,
}: {
  customerId?: string | null;
  name?: string | null;
  className?: string;
}) {
  const label = emptyDash(name);
  if (!customerId) {
    return <span className={className}>{label}</span>;
  }
  return (
    <Link
      to="/customers/$customerId"
      params={{ customerId }}
      className={cn(linkClass, className)}
    >
      {label}
    </Link>
  );
}

/** Policy number → same پرونده ۳۶۵ as the holder. */
export function PolicyDossierLink({
  customerId,
  label,
  policyId,
  className,
}: {
  customerId?: string | null;
  label?: string | null;
  policyId?: string | null;
  className?: string;
}) {
  const text = emptyDash(label);
  if (!customerId) {
    return <span className={cn("num", className)}>{text}</span>;
  }
  return (
    <Link
      to="/customers/$customerId"
      params={{ customerId }}
      hash={policyId ? `policy-${policyId}` : undefined}
      className={cn("num", linkClass, className)}
    >
      {text}
    </Link>
  );
}
