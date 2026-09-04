import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildDemoData, TODAY, type DemoData } from "./demo-data";
import { loadCrmData } from "./api-data";
import { toAsciiDigits } from "./display";
import {
  ROLE_PERMISSIONS,
  type ActivityKind,
  type AppUser,
  type Customer,
  type Installment,
  type Opportunity,
  type Permission,
  type PipelineStage,
  type Policy,
  type SavedFilter,
} from "./types";

interface Session {
  userId: string;
}

interface StoreValue extends DemoData {
  today: Date;
  hydrated: boolean;
  dataSource: "api" | "demo" | "loading";
  session: Session | null;
  currentUser: AppUser | null;
  can: (p: Permission) => boolean;
  login: (username: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  savedFilters: SavedFilter[];
  saveFilter: (f: SavedFilter) => void;
  removeFilter: (id: string) => void;
  upsertCustomer: (c: Customer) => void;
  bulkUpdateCustomers: (ids: string[], patch: Partial<Customer>) => void;
  deleteCustomers: (ids: string[]) => void;
  importCustomers: (rows: Customer[]) => void;
  registerPayment: (installmentId: string, amount: number, method: string) => void;
  toggleTask: (id: string) => void;
  markNotification: (id: string, read: boolean) => void;
  markAllNotifications: () => void;
  updateUserRole: (id: string, role: AppUser["role"]) => void;
  toggleUserActive: (id: string) => void;
  upsertOpportunity: (o: Opportunity) => void;
  moveOpportunity: (id: string, stage: PipelineStage, lostReason?: string) => void;
  addDealActivity: (opportunityId: string, kind: ActivityKind, body: string) => void;
  convertOpportunity: (id: string) => string | null;
  createPolicyFromOpportunity: (id: string) => string | null;
}

const StoreContext = createContext<StoreValue | null>(null);
const SESSION_KEY = "fasihi.session";
const FILTERS_KEY = "fasihi.filters";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DemoData>(() => buildDemoData());
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [dataSource, setDataSource] = useState<"api" | "demo" | "loading">("loading");
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setSession(JSON.parse(raw));
      const f = localStorage.getItem(FILTERS_KEY);
      if (f) setSavedFilters(JSON.parse(f));
    } catch {
      /* ignore corrupt storage */
    }

    const ac = new AbortController();
    (async () => {
      const result = await loadCrmData(ac.signal);
      if (ac.signal.aborted) return;
      setData(result.data);
      setDataSource(result.source);
      setHydrated(true);
    })();

    return () => ac.abort();
  }, []);

  const persistFilters = (next: SavedFilter[]) => {
    setSavedFilters(next);
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const currentUser = useMemo(
    () => data.users.find((u) => u.id === session?.userId) ?? null,
    [data.users, session],
  );

  const pushAudit = useCallback((actor: string, action: string, entity: string) => {
    setData((d) => ({
      ...d,
      audit: [
        { id: `AU-${Date.now()}`, actor, action, entity, ip: "192.168.1.10", date: new Date().toISOString() },
        ...d.audit,
      ],
    }));
  }, []);

  const login: StoreValue["login"] = useCallback(
    (username, password) => {
      const user = data.users.find((u) => u.username === username.trim());
      if (!user) return { ok: false, error: "نام کاربری یافت نشد." };
      if (!user.active) return { ok: false, error: "حساب کاربری غیرفعال است." };
      if (toAsciiDigits(password) !== "123456") return { ok: false, error: "رمز عبور نادرست است. (رمز نسخه نمایشی: ۱۲۳۴۵۶)" };
      const s = { userId: user.id };
      setSession(s);
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      } catch {
        /* storage unavailable */
      }
      pushAudit(user.name, "ورود به سامانه", "Auth");
      return { ok: true };
    },
    [data.users, pushAudit],
  );

  const logout = useCallback(() => {
    setSession(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const can = useCallback(
    (p: Permission) => (currentUser ? ROLE_PERMISSIONS[currentUser.role].includes(p) : false),
    [currentUser],
  );

  const value: StoreValue = {
    ...data,
    today: TODAY,
    hydrated,
    dataSource,
    session,
    currentUser,
    can,
    login,
    logout,
    savedFilters,
    saveFilter: (f) => persistFilters([...savedFilters.filter((x) => x.id !== f.id), f]),
    removeFilter: (id) => persistFilters(savedFilters.filter((x) => x.id !== id)),
    upsertCustomer: (c) => {
      setData((d) => ({
        ...d,
        customers: d.customers.some((x) => x.id === c.id)
          ? d.customers.map((x) => (x.id === c.id ? c : x))
          : [c, ...d.customers],
      }));
      pushAudit(currentUser?.name ?? "سیستم", "ثبت/ویرایش مشتری", `Customer:${c.id}`);
    },
    bulkUpdateCustomers: (ids, patch) => {
      setData((d) => ({
        ...d,
        customers: d.customers.map((c) => (ids.includes(c.id) ? { ...c, ...patch } : c)),
      }));
      pushAudit(currentUser?.name ?? "سیستم", `ویرایش گروهی ${ids.length} مشتری`, "Customer");
    },
    deleteCustomers: (ids) => {
      setData((d) => ({ ...d, customers: d.customers.filter((c) => !ids.includes(c.id)) }));
      pushAudit(currentUser?.name ?? "سیستم", `حذف ${ids.length} مشتری`, "Customer");
    },
    importCustomers: (rows) => {
      setData((d) => ({ ...d, customers: [...rows, ...d.customers] }));
      pushAudit(currentUser?.name ?? "سیستم", `ورود ${rows.length} رکورد از فایل`, "Import");
    },
    registerPayment: (installmentId, amount, method) => {
      setData((d) => ({
        ...d,
        installments: d.installments.map((i): Installment => {
          if (i.id !== installmentId) return i;
          const paidAmount = Math.min(i.amount, i.paidAmount + amount);
          const status: Installment["status"] =
            paidAmount >= i.amount ? "paid" : paidAmount > 0 ? "partial" : i.status;
          return {
            ...i,
            paidAmount,
            status,
            payments: [
              ...i.payments,
              {
                id: `PM-${Date.now()}`,
                amount,
                date: new Date().toISOString(),
                method,
                by: currentUser?.name ?? "سیستم",
              },
            ],
          };
        }),
      }));
      pushAudit(currentUser?.name ?? "سیستم", "ثبت پرداخت قسط", `Installment:${installmentId}`);
    },
    toggleTask: (id) =>
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })),
    markNotification: (id, read) =>
      setData((d) => ({ ...d, notifications: d.notifications.map((n) => (n.id === id ? { ...n, read } : n)) })),
    markAllNotifications: () =>
      setData((d) => ({ ...d, notifications: d.notifications.map((n) => ({ ...n, read: true })) })),
    updateUserRole: (id, role) => {
      setData((d) => ({ ...d, users: d.users.map((u) => (u.id === id ? { ...u, role } : u)) }));
      pushAudit(currentUser?.name ?? "سیستم", "تغییر نقش کاربر", `User:${id}`);
    },
    upsertOpportunity: (o) => {
      const now = new Date().toISOString();
      setData((d) => ({
        ...d,
        opportunities: d.opportunities.some((x) => x.id === o.id)
          ? d.opportunities.map((x) => (x.id === o.id ? { ...o, updatedAt: now } : x))
          : [{ ...o, updatedAt: now }, ...d.opportunities],
      }));
      pushAudit(currentUser?.name ?? "سیستم", "ثبت/ویرایش فرصت فروش", `Opportunity:${o.id}`);
    },
    moveOpportunity: (id, stage, lostReason) => {
      const now = new Date().toISOString();
      const actor = currentUser?.name ?? "سیستم";
      setData((d) => {
        const target = d.opportunities.find((o) => o.id === id);
        if (!target) return d;
        return {
          ...d,
          opportunities: d.opportunities.map((o) =>
            o.id === id ? { ...o, stage, lostReason: stage === "از دست رفته" ? lostReason : undefined, updatedAt: now } : o,
          ),
          dealActivities: [
            {
              id: `DA-${Date.now()}`,
              opportunityId: id,
              kind: "note" as ActivityKind,
              body: `تغییر مرحله از «${target.stage}» به «${stage}»${lostReason ? ` — دلیل: ${lostReason}` : ""}`,
              at: now,
              by: actor,
            },
            ...d.dealActivities,
          ],
        };
      });
      pushAudit(actor, `تغییر مرحله فرصت به ${stage}`, `Opportunity:${id}`);
    },
    addDealActivity: (opportunityId, kind, body) => {
      const now = new Date().toISOString();
      const actor = currentUser?.name ?? "سیستم";
      setData((d) => ({
        ...d,
        dealActivities: [{ id: `DA-${Date.now()}`, opportunityId, kind, body, at: now, by: actor }, ...d.dealActivities],
        opportunities: d.opportunities.map((o) => (o.id === opportunityId ? { ...o, updatedAt: now } : o)),
      }));
      pushAudit(actor, "ثبت فعالیت روی فرصت فروش", `Opportunity:${opportunityId}`);
    },
    convertOpportunity: (id) => {
      const opp = data.opportunities.find((o) => o.id === id);
      if (!opp || opp.customerId) return opp?.customerId ?? null;
      const newId = `C-${Date.now()}`;
      const now = new Date().toISOString();
      const customer: Customer = {
        id: newId,
        fullName: opp.contactName,
        nationalId: "—",
        phone: opp.phone,
        email: "",
        city: opp.city,
        status: opp.stage === "صدور" ? "active" : "lead",
        segment: "حقیقی",
        agent: opp.owner,
        createdAt: now,
        note: `ایجادشده از فرصت فروش ${opp.id} (منبع: ${opp.source})`,
      };
      setData((d) => ({
        ...d,
        customers: [customer, ...d.customers],
        opportunities: d.opportunities.map((o) => (o.id === id ? { ...o, customerId: newId, updatedAt: now } : o)),
      }));
      pushAudit(currentUser?.name ?? "سیستم", "تبدیل فرصت به بیمه‌گذار", `Customer:${newId}`);
      return newId;
    },
    createPolicyFromOpportunity: (id) => {
      const opp = data.opportunities.find((o) => o.id === id);
      if (!opp || !opp.customerId) return null;
      const now = new Date();
      const policy: Policy = {
        id: `P-${Date.now()}`,
        number: `پیش‌نویس-${Math.floor(Math.random() * 900000 + 100000)}`,
        customerId: opp.customerId,
        kind: opp.product,
        company: opp.company ?? "—",
        premium: opp.expectedPremium,
        startDate: now.toISOString(),
        endDate: new Date(now.getTime() + 365 * 86400000).toISOString(),
        status: "pending",
        installmentCount: 1,
      };
      setData((d) => ({ ...d, policies: [policy, ...d.policies] }));
      pushAudit(currentUser?.name ?? "سیستم", "ایجاد بیمه‌نامه پیش‌نویس از فرصت فروش", `Policy:${policy.id}`);
      return policy.id;
    },
    toggleUserActive: (id) => {
      setData((d) => ({ ...d, users: d.users.map((u) => (u.id === id ? { ...u, active: !u.active } : u)) }));
      pushAudit(currentUser?.name ?? "سیستم", "تغییر وضعیت کاربر", `User:${id}`);
    },
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
