import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  apiDataErrorMessage,
  getApiData,
  getDataSummary,
  resetCrmFetches,
  type HealthCounts,
} from "./api";
import {
  afterPersistSuccess,
  patchCustomer,
  postInstallmentPayment,
  resolvePolicyholderCode,
} from "./persist-api";
import { apiLogin, apiLogout, pingAuthedSession, verifyDemoPassword } from "./auth";
import type { CrmSource } from "./crm-source";
import { buildDemoData, TODAY, type DemoData } from "./demo-data";
import { upsertById } from "./dossier";
import { mapApiSnapshot, mapCustomer } from "./map-api-data";
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
  /** CRM rows: pending only while `/api/data` is in-flight; error + Retry if timeout/fail. */
  crmSource: CrmSource;
  crmError: string | null;
  /** Counts from GET /api/data/summary — first-paint KPI when full snapshot not ready. */
  summaryCounts: HealthCounts | null;
  /** True after a successful full GET /api/data hydrate (policies/installments arrays). */
  crmFullReady: boolean;
  retryCrmData: () => void;
  mergeDossierSnapshot: (snap: {
    customers?: Customer[];
    policies?: Policy[];
    installments?: Installment[];
  }) => void;
  session: Session | null;
  currentUser: AppUser | null;
  can: (p: Permission) => boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
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

function seedWithoutCrm(): DemoData {
  const demo = buildDemoData();
  return { ...demo, customers: [], policies: [], installments: [] };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DemoData>(seedWithoutCrm);
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [crmSource, setCrmSource] = useState<CrmSource>("pending");
  const [crmError, setCrmError] = useState<string | null>(null);
  const [summaryCounts, setSummaryCounts] = useState<HealthCounts | null>(null);
  const [crmFullReady, setCrmFullReady] = useState(false);
  const [today, setToday] = useState<Date>(TODAY);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let restored: Session | null = null;
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (raw) restored = JSON.parse(raw) as Session;
        const f = localStorage.getItem(FILTERS_KEY);
        if (f) setSavedFilters(JSON.parse(f) as SavedFilter[]);
      } catch {
        /* ignore corrupt storage */
      }
      if (restored) {
        const ok = await pingAuthedSession();
        if (cancelled) return;
        if (!ok) {
          restored = null;
          try {
            localStorage.removeItem(SESSION_KEY);
          } catch {
            /* storage unavailable */
          }
        }
      }
      if (cancelled) return;
      setSession(restored);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyCrmResult = useCallback((res: Awaited<ReturnType<typeof getApiData>>) => {
    if (res.source === "live") {
      const asOf = new Date();
      const snapshot = mapApiSnapshot(res.data, asOf);
      setToday(asOf);
      setData((d) => ({ ...d, ...snapshot }));
      setCrmError(null);
      setCrmFullReady(true);
      setCrmSource("live");
      return;
    }
    setData((d) => {
      if (d.customers.length > 0) return d;
      const demo = buildDemoData();
      return {
        ...d,
        customers: demo.customers,
        policies: demo.policies,
        installments: demo.installments,
      };
    });
    setCrmError(null);
    setCrmSource((src) => (src === "live" ? src : "mock"));
  }, []);

  const mergeDossierSnapshot = useCallback(
    (snap: { customers?: Customer[]; policies?: Policy[]; installments?: Installment[] }) => {
      setData((d) => ({
        ...d,
        customers: snap.customers?.length ? upsertById(d.customers, snap.customers) : d.customers,
        policies: snap.policies?.length ? upsertById(d.policies, snap.policies) : d.policies,
        installments: snap.installments?.length
          ? upsertById(d.installments, snap.installments)
          : d.installments,
      }));
      setCrmSource((src) => (src === "error" || src === "pending" ? "live" : src));
      setCrmError(null);
    },
    [],
  );

  const applySummary = useCallback(
    (summary: { customers: Customer[]; counts?: HealthCounts }) => {
      const customers = summary.customers;
      setData((d) => ({ ...d, customers: customers.length ? customers : d.customers }));
      if (summary.counts) {
        setSummaryCounts(summary.counts);
      }
      if (customers.length || summary.counts) {
        setCrmSource("live");
      }
    },
    [],
  );

  const markFullHydrateError = useCallback((err: unknown) => {
    setCrmFullReady(false);
    setCrmError(apiDataErrorMessage(err));
    setCrmSource((src) => (src === "live" ? src : "error"));
  }, []);

  const loadCrmData = useCallback(
    (resetInflight: boolean) => {
      if (resetInflight) resetCrmFetches();
      setCrmSource((src) => (src === "live" ? src : "pending"));
      setCrmError(null);
      setCrmFullReady(false);
      return getDataSummary()
        .then((summary) => {
          if (summary.source !== "live") return;
          applySummary({
            customers: summary.data.customers.map(mapCustomer),
            counts: summary.data.counts,
          });
        })
        .catch(() => undefined)
        .then(() => getApiData())
        .then(applyCrmResult)
        .catch((err) => {
          markFullHydrateError(err);
        });
    },
    [applyCrmResult, applySummary, markFullHydrateError],
  );

  useEffect(() => {
    if (!hydrated || !session) return;
    let cancelled = false;
    void (async () => {
      try {
        const summary = await getDataSummary();
        if (cancelled) return;
        if (summary.source === "live") {
          applySummary({
            customers: summary.data.customers.map(mapCustomer),
            counts: summary.data.counts,
          });
        }
      } catch {
        /* dossier/list can still hydrate from slim customer endpoint or /api/data */
      }
      try {
        const full = await getApiData();
        if (cancelled) return;
        applyCrmResult(full);
      } catch (err) {
        if (cancelled) return;
        markFullHydrateError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, session, applyCrmResult, applySummary, markFullHydrateError]);

  const retryCrmData = useCallback(() => {
    void loadCrmData(true);
  }, [loadCrmData]);

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
        {
          id: `AU-${Date.now()}`,
          actor,
          action,
          entity,
          ip: "192.168.1.10",
          date: new Date().toISOString(),
        },
        ...d.audit,
      ],
    }));
  }, []);

  const login: StoreValue["login"] = useCallback(
    async (username, password) => {
      const user = data.users.find((u) => u.username === username.trim());
      if (!user) return { ok: false, error: "نام کاربری یافت نشد." };
      if (!user.active) return { ok: false, error: "حساب کاربری غیرفعال است." };
      if (!verifyDemoPassword(password)) return { ok: false, error: "رمز عبور نادرست است." };
      const api = await apiLogin(username.trim(), password);
      if (!api.ok) return { ok: false, error: api.error };
      const s = { userId: user.id };
      setSession(s);
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      } catch {
        /* storage unavailable */
      }
      pushAudit(user.name, "ورود به سامانه", "Auth");
      void loadCrmData(true);
      return { ok: true };
    },
    [data.users, pushAudit, loadCrmData],
  );

  const logout = useCallback(() => {
    setSession(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable */
    }
    resetCrmFetches();
    setCrmSource("pending");
    setCrmError(null);
    setSummaryCounts(null);
    setCrmFullReady(false);
    setData(seedWithoutCrm());
    void apiLogout();
  }, []);

  const can = useCallback(
    (p: Permission) => (currentUser ? ROLE_PERMISSIONS[currentUser.role].includes(p) : false),
    [currentUser],
  );

  const value: StoreValue = {
    ...data,
    today,
    hydrated,
    crmSource,
    crmError,
    summaryCounts,
    crmFullReady,
    retryCrmData,
    mergeDossierSnapshot,
    session,
    currentUser,
    can,
    login,
    logout,
    savedFilters,
    saveFilter: (f) => persistFilters([...savedFilters.filter((x) => x.id !== f.id), f]),
    removeFilter: (id) => persistFilters(savedFilters.filter((x) => x.id !== id)),
    // P1 persist: try API PATCH first (preserves source_system), then local optimistic.
    upsertCustomer: (c) => {
      const applyLocal = () => {
        setData((d) => ({
          ...d,
          customers: d.customers.some((x) => x.id === c.id)
            ? d.customers.map((x) => (x.id === c.id ? c : x))
            : [c, ...d.customers],
        }));
        pushAudit(currentUser?.name ?? "سیستم", "ثبت/ویرایش مشتری", `Customer:${c.id}`);
      };
      const code = resolvePolicyholderCode(c);
      if (!code) {
        applyLocal();
        return;
      }
      void patchCustomer(code, {
        mobile: c.phone,
        name: c.fullName,
        note: c.note ?? "",
        performedBy: currentUser?.name,
      })
        .then((res) => {
          applyLocal();
          if (res && "ok" in res && res.ok) afterPersistSuccess();
        })
        .catch(() => {
          applyLocal();
        });
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
      const applyLocal = () => {
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
      };
      void postInstallmentPayment({
        installmentId,
        amount,
        method,
        performedBy: currentUser?.name,
      })
        .then((res) => {
          applyLocal();
          if (res && "ok" in res && res.ok) afterPersistSuccess();
        })
        .catch(() => {
          applyLocal();
        });
    },
    toggleTask: (id) =>
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      })),
    markNotification: (id, read) =>
      setData((d) => ({
        ...d,
        notifications: d.notifications.map((n) => (n.id === id ? { ...n, read } : n)),
      })),
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
            o.id === id
              ? {
                  ...o,
                  stage,
                  lostReason: stage === "از دست رفته" ? lostReason : undefined,
                  updatedAt: now,
                }
              : o,
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
        dealActivities: [
          { id: `DA-${Date.now()}`, opportunityId, kind, body, at: now, by: actor },
          ...d.dealActivities,
        ],
        opportunities: d.opportunities.map((o) =>
          o.id === opportunityId ? { ...o, updatedAt: now } : o,
        ),
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
        legalEntityId: "",
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
        opportunities: d.opportunities.map((o) =>
          o.id === id ? { ...o, customerId: newId, updatedAt: now } : o,
        ),
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
      pushAudit(
        currentUser?.name ?? "سیستم",
        "ایجاد بیمه‌نامه پیش‌نویس از فرصت فروش",
        `Policy:${policy.id}`,
      );
      return policy.id;
    },
    toggleUserActive: (id) => {
      setData((d) => ({
        ...d,
        users: d.users.map((u) => (u.id === id ? { ...u, active: !u.active } : u)),
      }));
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
