import { BRAND, BRAND_ASSETS } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Official Karafarin diamond, fixed at the physical top-right in RTL.
 *  Badge lock: logo + digits 3045 only — no «کد ۳۰۴۵», no dark panel.
 */
export function LoginBrandLockup({ className = "" }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed start-4 top-4 z-30 flex flex-col items-center gap-0.5 sm:start-6 sm:top-5",
        className,
      )}
    >
      <img
        src={BRAND_ASSETS.lux.badge}
        alt={`لوگوی ${BRAND.insurer}`}
        className="emblem-logo-pulse login-lockup-mark h-14 w-14 object-cover object-center drop-shadow-[0_8px_18px_rgba(0,0,0,0.4)] sm:h-16 sm:w-16"
      />
      <p className="text-xs font-extrabold tracking-[0.18em] text-title drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)] sm:text-sm">
        {BRAND.agencyCode}
      </p>
    </div>
  );
}
