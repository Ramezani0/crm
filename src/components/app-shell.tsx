import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { CTA_BUTTON_CLASS, useBrandButtonFlash } from "@/lib/button-brand";
import {
  Archive,
  Bell,
  Calculator,
  CalendarClock,
  ClipboardList,
  Coins,
  HeartPulse,
  Hospital,
  FileBarChart,
  Gauge,
  Gift,
  Building2,
  GitBranch,
  LogOut,
  ScrollText,
  MessageSquare,
  Network,
  Settings,
  Shield,
  ShieldCheck,
  TriangleAlert,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import { useStore, useOnline } from "@/lib/store";
import { BRAND } from "@/lib/brand";
import { ROLES, type Permission } from "@/lib/types";
import { ApiErrorBanner, MockDataBanner, OfflineBanner, PermissionState } from "./states";
import { BrandMark } from "./brand-mark";
import { BrandFooter } from "./brand-footer";
import { BrandWatermark } from "./brand-watermark";
import { ThemeSwitch } from "./theme-switch";
import { CrmDossierSearch } from "./crm-search";
import { toFa } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRIMARY_NAV: { to: string; label: string; icon: typeof Gauge; perm: Permission }[] = [
  { to: "/dashboard", label: "داشبورد", icon: Gauge, perm: "dashboard.view" },
  { to: "/customers", label: "مشتریان", icon: Users, perm: "customers.view" },
  { to: "/policies", label: "بیمه‌نامه‌ها", icon: ShieldCheck, perm: "policies.view" },
  { to: "/premium-calc", label: "بیمه‌بازار", icon: Calculator, perm: "tools.view" },
  { to: "/installments", label: "اقساط", icon: Wallet, perm: "installments.view" },
  { to: "/renewals", label: "تمدید", icon: CalendarClock, perm: "policies.view" },
  { to: "/pipeline", label: "پایپلاین", icon: GitBranch, perm: "pipeline.view" },
  { to: "/reports", label: "گزارش‌ها", icon: FileBarChart, perm: "reports.view" },
  { to: "/users", label: "کاربران", icon: UsersRound, perm: "users.manage" },
];

const SECONDARY_NAV: { to: string; label: string; icon: typeof Gauge; perm: Permission }[] = [
  { to: "/tasks", label: "وظایف", icon: ClipboardList, perm: "tasks.view" },
  { to: "/notifications", label: "اعلان‌ها", icon: Bell, perm: "notifications.view" },
  { to: "/sms-panel", label: "پنل پیامک", icon: MessageSquare, perm: "settings.manage" },
  { to: "/urgent-tasks", label: "کارهای ضروری", icon: TriangleAlert, perm: "tasks.view" },
  { to: "/sales-network", label: "شبکه فروش", icon: Network, perm: "tools.view" },
  { to: "/sima-zar", label: "سیما زر", icon: Coins, perm: "tools.view" },
  { to: "/omid-pension", label: "امید بازنشستگی", icon: HeartPulse, perm: "tools.view" },
  { to: "/group-health", label: "درمان گروهی", icon: Hospital, perm: "tools.view" },
  { to: "/sanhab", label: "سنهاب", icon: Shield, perm: "tools.view" },
  { to: "/dms", label: "بایگانی", icon: Archive, perm: "tools.view" },
  { to: "/loyalty", label: "باشگاه", icon: Gift, perm: "tools.view" },
  { to: "/branch-ops", label: "عملیات شعبه", icon: Building2, perm: "tools.view" },
  { to: "/settings", label: "تنظیمات", icon: Settings, perm: "settings.manage" },
  { to: "/audit", label: "رخدادها", icon: ScrollText, perm: "audit.view" },
];

function LogoutButton({ onLogout }: { onLogout: () => void }) {
  const { flash, triggerFlash } = useBrandButtonFlash();
  return (
    <button
      type="button"
      data-btn-flash={flash ?? undefined}
      onClick={() => {
        triggerFlash();
        onLogout();
      }}
      className={cn(
        CTA_BUTTON_CLASS,
        "mx-3 mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-base text-muted-foreground hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <LogOut className="size-4" aria-hidden />
      خروج از حساب
    </button>
  );
}

function FeedbackNavLink({ className, onClick, ...props }: ComponentProps<typeof Link>) {
  const { flash, triggerFlash } = useBrandButtonFlash();
  return (
    <Link
      {...props}
      className={cn(CTA_BUTTON_CLASS, className)}
      data-btn-flash={flash ?? undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) triggerFlash();
      }}
    />
  );
}

function NavLinks({
  items,
  pathname,
  hydrated,
  can,
  unread,
}: {
  items: typeof PRIMARY_NAV;
  pathname: string;
  hydrated: boolean;
  can: (p: Permission) => boolean;
  unread: number;
}) {
  return (
    <>
      {items
        .filter((n) => !hydrated || can(n.perm))
        .map((item) => {
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <FeedbackNavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-[inset_2px_0_0_0_var(--sidebar-primary)]"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
              )}
            >
              <item.icon className="size-4" aria-hidden />
              <span>{item.label}</span>
              {item.to === "/notifications" && unread > 0 && (
                <span className="ms-auto rounded-full bg-primary px-2 text-[11px] text-primary-foreground">
                  {toFa(unread)}
                </span>
              )}
            </FeedbackNavLink>
          );
        })}
    </>
  );
}

export function AppShell({
  title,
  subtitle,
  holderCode,
  leading,
  actions,
  permission,
  children,
}: {
  title: string;
  subtitle?: string;
  /** کد بیمه‌گذار (holder_code) — never nationalId, never agency 3045. */
  holderCode?: string;
  leading?: ReactNode;
  actions?: ReactNode;
  permission?: Permission;
  children: ReactNode;
}) {
  const { currentUser, can, logout, notifications, hydrated, crmSource, crmError, retryCrmData } =
    useStore();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const online = useOnline();

  if (hydrated && !currentUser) {
    navigate({ to: "/", replace: true });
    return null;
  }

  const unread = notifications.filter((n) => !n.read).length;
  const roleLabel = ROLES.find((r) => r.id === currentUser?.role)?.label;
  const allowed = !permission || !hydrated || can(permission);
  const mobileNav = [...PRIMARY_NAV, ...SECONDARY_NAV];

  return (
    <div className="relative min-h-screen bg-background">
      <BrandWatermark />
      <div className="relative z-[1] flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-l border-sidebar-border bg-sidebar lg:flex">
          <div className="flex items-center gap-3 px-5 py-5">
            <BrandMark size="md" className="size-11" />
            <div>
              <p className="text-lg font-bold leading-relaxed text-title">{BRAND.title}</p>
              <p className="text-xs text-muted-foreground">{BRAND.subtitleShort}</p>
            </div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="منوی اصلی">
            <NavLinks
              items={PRIMARY_NAV}
              pathname={pathname}
              hydrated={hydrated}
              can={can}
              unread={unread}
            />
            <p className="px-3 pt-4 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground">
              سایر
            </p>
            <NavLinks
              items={SECONDARY_NAV}
              pathname={pathname}
              hydrated={hydrated}
              can={can}
              unread={unread}
            />
          </nav>
          <div className="px-3 pb-2">
            <ThemeSwitch className="w-full justify-center" />
          </div>
          <LogoutButton
            onLogout={() => {
              logout();
              navigate({ to: "/", replace: true });
            }}
          />
          <BrandFooter className="px-4 pb-4 text-xs" />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <BrandMark size="sm" className="size-8 lg:hidden" />
                {leading}
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-bold text-title">{title}</h1>
                  {holderCode ? (
                    <p className="num truncate text-sm text-muted-foreground">
                      کد بیمه‌گذار {toFa(holderCode)}
                    </p>
                  ) : null}
                  {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">{actions}</div>
              <CrmDossierSearch />
              <ThemeSwitch compact className="lg:hidden" />
              <div className="flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1.5">
                <div className="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {currentUser?.name.slice(0, 1) ?? "؟"}
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold leading-relaxed">{currentUser?.name}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel}</p>
                </div>
              </div>
            </div>
            <nav
              className="flex gap-1 overflow-x-auto border-t border-border/60 px-2 py-1 lg:hidden"
              aria-label="منوی موبایل"
            >
              {mobileNav
                .filter((n) => !hydrated || can(n.perm))
                .map((item) => (
                  <FeedbackNavLink
                    key={item.to}
                    to={item.to}
                    className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[status=active]:bg-secondary data-[status=active]:text-foreground"
                  >
                    <item.icon className="size-3.5" aria-hidden />
                    {item.label}
                  </FeedbackNavLink>
                ))}
            </nav>
          </header>

          <main className="flex-1 space-y-4 p-4 sm:p-6">
            {!online && <OfflineBanner />}
            {crmError && (
              <ApiErrorBanner message={crmError} onRetry={retryCrmData} />
            )}
            {crmSource === "mock" && <MockDataBanner />}
            {allowed ? children : <PermissionState role={roleLabel} />}
          </main>
        </div>
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass rounded-2xl p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex-1">
            {title && <h2 className="text-base font-bold text-title">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
