import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Bell,
  ClipboardList,
  FileSpreadsheet,
  Gauge,
  GitBranch,
  LayoutList,
  LogOut,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
  Wallet,
  FileBarChart,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useStore, useOnline } from "@/lib/store";
import { ROLES, type Permission } from "@/lib/types";
import { OfflineBanner, PermissionState } from "./states";
import { EmblemFallback } from "./emblem/EmblemFallback";
import { toFa } from "@/lib/format";

const NAV: { to: string; label: string; icon: typeof Gauge; perm: Permission }[] = [
  { to: "/dashboard", label: "داشبورد", icon: Gauge, perm: "dashboard.view" },
  { to: "/pipeline", label: "قیف فروش", icon: GitBranch, perm: "pipeline.view" },
  { to: "/customers", label: "بیمه‌گذاران", icon: Users, perm: "customers.view" },
  { to: "/policies", label: "بیمه‌نامه‌ها", icon: ShieldCheck, perm: "policies.view" },
  { to: "/installments", label: "اقساط و پرداخت", icon: Wallet, perm: "installments.view" },
  { to: "/import", label: "ورود اطلاعات", icon: FileSpreadsheet, perm: "import.run" },
  { to: "/reports", label: "گزارش‌ها", icon: FileBarChart, perm: "reports.view" },
  { to: "/tasks", label: "وظایف و یادآوری", icon: ClipboardList, perm: "tasks.view" },
  { to: "/notifications", label: "اعلان‌ها", icon: Bell, perm: "notifications.view" },
  { to: "/users", label: "کاربران و نقش‌ها", icon: UsersRound, perm: "users.manage" },
  { to: "/settings", label: "تنظیمات", icon: Settings, perm: "settings.manage" },
  { to: "/audit", label: "گزارش رخدادها", icon: ScrollText, perm: "audit.view" },
];

export function AppShell({
  title,
  subtitle,
  actions,
  permission,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  permission?: Permission;
  children: ReactNode;
}) {
  const { currentUser, can, logout, notifications, hydrated } = useStore();
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

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-l border-sidebar-border bg-sidebar lg:flex">
          <div className="flex items-center gap-3 px-5 py-5">
            <EmblemFallback className="size-9" />
            <div>
              <p className="text-sm font-bold leading-tight">CRM فصیحی</p>
              <p className="text-[11px] text-muted-foreground">سامانه مدیریت بیمه</p>
            </div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6" aria-label="منوی اصلی">
            {NAV.filter((n) => !hydrated || can(n.perm)).map((item) => {
              const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active
                      ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-[inset_2px_0_0_0_var(--sidebar-primary)]"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                  }`}
                >
                  <item.icon className="size-4" aria-hidden />
                  <span>{item.label}</span>
                  {item.to === "/notifications" && unread > 0 && (
                    <span className="ms-auto rounded-full bg-primary px-2 text-[11px] text-primary-foreground">
                      {toFa(unread)}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <button
            onClick={() => {
              logout();
              navigate({ to: "/", replace: true });
            }}
            className="mx-3 mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60"
          >
            <LogOut className="size-4" aria-hidden />
            خروج از حساب
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-bold">{title}</h1>
                {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
              </div>
              <div className="flex items-center gap-2">{actions}</div>
              <div className="flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1.5">
                <div className="grid size-7 place-items-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                  {currentUser?.name.slice(0, 1) ?? "؟"}
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-xs font-semibold leading-tight">{currentUser?.name}</p>
                  <p className="text-[10px] text-muted-foreground">{roleLabel}</p>
                </div>
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto border-t border-border/60 px-2 py-1 lg:hidden" aria-label="منوی موبایل">
              {NAV.filter((n) => !hydrated || can(n.perm)).map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
                >
                  <item.icon className="size-3.5" aria-hidden />
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>

          <main className="flex-1 space-y-4 p-4 sm:p-6">
            {!online && <OfflineBanner />}
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
            {title && <h2 className="text-sm font-bold">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export const LayoutListIcon = LayoutList;
