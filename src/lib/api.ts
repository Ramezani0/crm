import type { Customer, Installment, Policy } from "./types";

/** Same-origin when unset — matches Caddy `/api/*` on the VPS. */
export function apiUrl(path: `/api/${string}`): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}

/** Same-origin API fetch — always sends HttpOnly session cookie (`fasihi_session`). */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: init?.credentials ?? "include",
  });
}

/** Wire contract for GET /api/health — matches vps/app.py */
export type HealthCounts = {
  customers: number;
  policies: number;
  installments: number;
};

export type HealthOk = {
  ok: true;
  counts: HealthCounts;
};

export type HealthErr = {
  ok: false;
  error: string;
};

export type HealthResponse = HealthOk | HealthErr;

/** Wire contract for GET /api/data — matches vps/app.py mapped JSON */
export type ApiCustomer = Pick<
  Customer,
  | "id"
  | "fullName"
  | "nationalId"
  | "phone"
  | "email"
  | "city"
  | "status"
  | "segment"
  | "agent"
  | "createdAt"
  | "note"
> & {
  /** Present after API deploy of legal_entity_id; missing on older payloads. */
  legalEntityId?: string;
  holderCode?: string;
  holder_code?: string;
  mobile?: string;
  statusLabel?: string;
  address?: string;
  fatherName?: string;
  birthDate?: string;
  postalCode?: string;
  extras?: Record<string, string>;
};

export type ApiPolicy = {
  id: string;
  number: string;
  customerId: string;
  kind: string;
  kindRaw?: string;
  company: string;
  premium: number;
  /** Latest endorsement IP — policies.initial_premium (display; not auto ladder P0) */
  initialPremium?: number;
  /** Start-year P0 — policies.initial_premium_start or extras */
  initialPremiumStart?: number;
  /** Excel adjust % (10 → r=0.10); from policies.premium_adj_pct */
  premiumAdjPct?: number;
  /** Absent on the slim `/api/renewals` row — that endpoint only ships endDate. */
  startDate?: string;
  endDate: string;
  issueDate?: string;
  status: Policy["status"];
  statusLabel?: string;
  /** Absent on slim rows; the mapper defaults to 1. */
  installmentCount?: number;
  computerCode?: string;
  holderNationalId?: string;
  holderName?: string;
  holderCode?: string;
  holder_code?: string;
  /** Slim `/api/renewals` joins the holder name so the table needs no customer dump. */
  customerName?: string;
  policyNumber?: string;
  daysLeft?: number;
  daysOverdue?: number | null;
  extras?: Record<string, string>;
};

export type ApiInstallment = {
  id: string;
  policyId: string;
  customerId: string;
  seq: number;
  amount: number;
  paidAmount: number;
  unpaidAmount?: number | null;
  unpaid_amount?: number | string | null;
  dueDate: string;
  status: Installment["status"] | "overdue" | "history" | "unpaid";
  statusLabel?: string;
  kind?: string;
  computerCode?: string;
  holderCode?: string;
  holder_code?: string;
  payerNationalId?: string;
  insuredNationalId?: string;
  paymentMethod?: string;
  paidDate?: string;
  /** Absent on the slim `/api/installments` row. */
  payments?: Installment["payments"];
  /** Slim `/api/installments` joins holder name and policy number for the table. */
  customerName?: string;
  policyNumber?: string;
  daysLeft?: number;
  extras?: Record<string, string>;
};

export type ApiDataResponse = {
  customers: ApiCustomer[];
  policies: ApiPolicy[];
  installments: ApiInstallment[];
};

/** Documented production counts (CURSOR.md / AGENCY.md). Mock only — not a live query. */
export const MOCK_HEALTH: HealthOk = {
  ok: true,
  counts: { customers: 1352, policies: 3499, installments: 3112 },
};

export const MOCK_DATA: ApiDataResponse = {
  customers: [
    {
      id: "C-demo-1",
      fullName: "فاطمه محمدی",
      nationalId: "0012345678",
      legalEntityId: "",
      phone: "09121234567",
      email: "",
      city: "تهران",
      status: "active",
      segment: "حقیقی",
      agent: "سمیرا کریمی",
      createdAt: "2026-01-15T00:00:00+00:00",
      note: "",
    },
  ],
  policies: [
    {
      id: "P-demo-1",
      number: "1404/100201",
      customerId: "C-demo-1",
      kind: "شخص ثالث",
      company: "بیمه کارآفرین",
      premium: 42_000_000,
      startDate: "2026-03-01",
      endDate: "2027-03-01",
      status: "active",
      installmentCount: 4,
    },
  ],
  installments: [
    {
      id: "I-demo-1",
      policyId: "P-demo-1",
      customerId: "C-demo-1",
      seq: 1,
      amount: 10_500_000,
      paidAmount: 0,
      dueDate: "2026-06-01",
      status: "overdue",
      payments: [],
    },
  ],
};

export type FetchSource = "live" | "mock";

export type ClientResult<T> = {
  data: T;
  source: FetchSource;
};

/** Browser/Caddy often stall on the ~20MB `/api/data` snapshot; never wait forever. */
export const API_FETCH_TIMEOUT_MS = 90_000;
/** List/dossier slim endpoints should fail fast — never sit on a 100s skeleton. */
export const API_SLIM_TIMEOUT_MS = 15_000;
/** `/api/data/summary` can be ~0.5MB and ~10s after large imports. */
export const API_SUMMARY_TIMEOUT_MS = 45_000;

export function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: string }).name) : "";
  if (name === "TimeoutError" || name === "AbortError") return true;
  const msg = "message" in err ? String((err as { message?: string }).message).toLowerCase() : "";
  return msg.includes("timeout") || msg.includes("aborted");
}

export function apiDataErrorMessage(err: unknown, endpoint = "/api/data"): string {
  if (isTimeoutError(err)) {
    return `زمان انتظار خواندن ${endpoint} به پایان رسید. پاسخ ناقص یا اتصال قطع شد — دوباره تلاش کنید.`;
  }
  if (err instanceof TypeError) {
    return `ارتباط با ${endpoint} برقرار نشد. دوباره تلاش کنید.`;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return `خواندن ${endpoint} ناموفق بود. دوباره تلاش کنید.`;
}

function shouldRetryFetch(err: unknown): boolean {
  if (isTimeoutError(err) || err instanceof TypeError) return true;
  if (err instanceof Error && /HTTP 5\d\d/.test(err.message)) return true;
  return false;
}

async function getJson<T>(path: `/api/${string}`, timeoutMs = API_FETCH_TIMEOUT_MS): Promise<T> {
  const res = await apiFetch(apiUrl(path), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(message);
  }
  try {
    return (await res.json()) as T;
  } catch (err) {
    if (isTimeoutError(err)) throw err;
    throw new Error("پاسخ /api/data ناقص یا نامعتبر است.");
  }
}

export async function fetchHealth(): Promise<ClientResult<HealthResponse>> {
  try {
    const data = await getJson<HealthResponse>("/api/health");
    if (data && typeof data === "object" && "ok" in data) {
      return { data, source: "live" };
    }
    return { data: MOCK_HEALTH, source: "mock" };
  } catch {
    return { data: MOCK_HEALTH, source: "mock" };
  }
}

function isApiData(data: unknown): data is ApiDataResponse {
  if (!data || typeof data !== "object") return false;
  const d = data as Partial<ApiDataResponse>;
  return Array.isArray(d.customers) && Array.isArray(d.policies) && Array.isArray(d.installments);
}

async function fetchApiDataOnce(): Promise<ClientResult<ApiDataResponse>> {
  const data = await getJson<unknown>("/api/data");
  if (data && typeof data === "object" && "ok" in data && (data as HealthErr).ok === false) {
    throw new Error((data as HealthErr).error || "API /api/data خطا داد.");
  }
  if (isApiData(data)) {
    return { data, source: "live" };
  }
  return { data: MOCK_DATA, source: "mock" };
}

/** Live `/api/data` with one retry on timeout/network/5xx. Invalid shape still falls back to mock. */
export async function fetchApiData(): Promise<ClientResult<ApiDataResponse>> {
  try {
    return await fetchApiDataOnce();
  } catch (err) {
    if (!shouldRetryFetch(err)) throw err;
    return fetchApiDataOnce();
  }
}

let apiDataInflight: Promise<ClientResult<ApiDataResponse>> | null = null;

/** Drop a hung or failed inflight so Retry can call `getApiData()` again. */
export function resetApiDataFetch(): void {
  apiDataInflight = null;
}

/** Deduped boot fetch for the store. Failures are not cached; Retry must call `resetApiDataFetch()`. */
export function getApiData(): Promise<ClientResult<ApiDataResponse>> {
  if (!apiDataInflight) {
    apiDataInflight = fetchApiData().then(
      (res) => res,
      (err) => {
        apiDataInflight = null;
        throw err;
      },
    );
  }
  return apiDataInflight;
}

export type ApiDataSummary = {
  customers: ApiCustomer[];
  counts?: HealthCounts;
};

export type ApiCustomersPage = {
  customers: ApiCustomer[];
  total: number;
  limit: number;
  offset: number;
};

export type ApiDossierResponse = {
  customer: ApiCustomer;
  policies: ApiPolicy[];
  installments: ApiInstallment[];
  holderCodes?: string[];
};

function isApiSummary(data: unknown): data is ApiDataSummary {
  if (!data || typeof data !== "object") return false;
  return Array.isArray((data as Partial<ApiDataSummary>).customers);
}

function isApiDossier(data: unknown): data is ApiDossierResponse {
  if (!data || typeof data !== "object") return false;
  const d = data as Partial<ApiDossierResponse>;
  return Boolean(d.customer) && Array.isArray(d.policies) && Array.isArray(d.installments);
}

async function fetchSlimOnce<T>(path: `/api/${string}`): Promise<T> {
  const data = await getJson<unknown>(path, API_SLIM_TIMEOUT_MS);
  if (data && typeof data === "object" && "ok" in data && (data as HealthErr).ok === false) {
    throw new Error((data as HealthErr).error || `API ${path} خطا داد.`);
  }
  return data as T;
}

/** Customers only — no 20MB installments dump. */
export async function fetchDataSummary(): Promise<ClientResult<ApiDataSummary>> {
  const data = await getJson<unknown>("/api/data/summary", API_SUMMARY_TIMEOUT_MS);
  if (data && typeof data === "object" && "ok" in data && (data as HealthErr).ok === false) {
    throw new Error((data as HealthErr).error || "API /api/data/summary خطا داد.");
  }
  if (isApiSummary(data)) {
    return { data, source: "live" };
  }
  throw new Error("پاسخ /api/data/summary نامعتبر است.");
}

export async function fetchCustomersPage(
  limit = 50,
  offset = 0,
  q = "",
  filters: { segment?: "حقیقی" | "حقوقی" } = {},
): Promise<ClientResult<ApiCustomersPage>> {
  const sp = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const qq = q.trim();
  if (qq) sp.set("q", qq);
  if (filters.segment) sp.set("segment", filters.segment);
  const path = `/api/customers?${sp.toString()}` as `/api/${string}`;
  const data = await fetchSlimOnce<unknown>(path);
  if (data && typeof data === "object" && Array.isArray((data as ApiCustomersPage).customers)) {
    const page = data as ApiCustomersPage;
    return {
      data: {
        customers: page.customers,
        total: Number(page.total) || page.customers.length,
        limit: Number(page.limit) || limit,
        offset: Number(page.offset) || offset,
      },
      source: "live",
    };
  }
  throw new Error("پاسخ /api/customers نامعتبر است.");
}

export async function fetchCustomerDossier(
  customerId: string,
): Promise<ClientResult<ApiDossierResponse>> {
  const id = encodeURIComponent(customerId.trim());
  const data = await fetchSlimOnce<unknown>(`/api/customers/${id}`);
  if (isApiDossier(data)) {
    return { data, source: "live" };
  }
  throw new Error("پاسخ پرونده بیمه‌گذار نامعتبر است.");
}

export type ApiPoliciesLite = {
  policies: ApiPolicy[];
  total: number;
  limit?: number;
  offset?: number;
};

export async function fetchPoliciesLite(
  limit = 50,
  offset = 0,
  q = "",
  filters: { year?: number; month?: number } = {},
): Promise<ClientResult<ApiPoliciesLite>> {
  const sp = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (q.trim()) sp.set("q", q.trim());
  if (Number.isInteger(filters.year)) sp.set("year", String(filters.year));
  if (Number.isInteger(filters.month)) sp.set("month", String(filters.month));
  const path = `/api/policies/lite?${sp.toString()}` as `/api/${string}`;
  const data = await fetchSlimOnce<unknown>(path);
  if (data && typeof data === "object" && Array.isArray((data as ApiPoliciesLite).policies)) {
    const page = data as ApiPoliciesLite;
    return {
      data: {
        policies: page.policies,
        total: Number(page.total) || page.policies.length,
        limit: Number(page.limit) || limit,
        offset: Number(page.offset) || offset,
      },
      source: "live",
    };
  }
  throw new Error("پاسخ /api/policies/lite نامعتبر است.");
}

export type ApiInstallmentsDue = {
  installments: ApiInstallment[];
  total: number;
  limit?: number;
  offset?: number;
  statuses?: string[];
  asOf?: string;
};

export type ApiRenewalsResponse = {
  policies: ApiPolicy[];
  total: number;
  limit?: number;
  offset?: number;
  withinDays?: number;
  asOf?: string;
};

/** اقساط page shows سررسید + معوق only; the API defaults to the same pair. */
export const DUE_INSTALLMENT_STATUS_QUERY = "overdue,due";
export const SLIM_FEED_LIMIT = 200;

/** Unpaid/overdue installments without the ~20MB `/api/data` snapshot. */
export async function fetchInstallmentsDue(
  limit = SLIM_FEED_LIMIT,
  offset = 0,
  status = DUE_INSTALLMENT_STATUS_QUERY,
  q = "",
): Promise<ClientResult<ApiInstallmentsDue>> {
  const sp = new URLSearchParams({
    status,
    limit: String(limit),
    offset: String(offset),
  });
  const qq = q.trim();
  if (qq) sp.set("q", qq);
  const data = await fetchSlimOnce<unknown>(`/api/installments?${sp.toString()}`);
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as ApiInstallmentsDue).installments)
  ) {
    const page = data as ApiInstallmentsDue;
    return {
      data: {
        installments: page.installments,
        total: Number(page.total) || page.installments.length,
        limit: Number(page.limit) || limit,
        offset: Number(page.offset) || offset,
        statuses: page.statuses,
        asOf: page.asOf,
      },
      source: "live",
    };
  }
  throw new Error("پاسخ /api/installments نامعتبر است.");
}

/** Active policies whose پایان پوشش falls inside the 0..withinDays window (Jalali-aware on the API). */
export async function fetchRenewals(
  withinDays = 45,
  limit = SLIM_FEED_LIMIT,
  offset = 0,
): Promise<ClientResult<ApiRenewalsResponse>> {
  const sp = new URLSearchParams({
    withinDays: String(withinDays),
    limit: String(limit),
    offset: String(offset),
  });
  const data = await fetchSlimOnce<unknown>(`/api/renewals?${sp.toString()}`);
  if (data && typeof data === "object") {
    const page = data as ApiRenewalsResponse & { renewals?: ApiPolicy[] };
    const policies = Array.isArray(page.policies)
      ? page.policies
      : Array.isArray(page.renewals)
        ? page.renewals
        : null;
    if (policies) {
      return {
        data: {
          policies,
          total: Number(page.total) || policies.length,
          limit: Number(page.limit) || limit,
          offset: Number(page.offset) || offset,
          withinDays: Number(page.withinDays) || withinDays,
          asOf: page.asOf,
        },
        source: "live",
      };
    }
  }
  throw new Error("پاسخ /api/renewals نامعتبر است.");
}

let summaryInflight: Promise<ClientResult<ApiDataSummary>> | null = null;

export function resetDataSummaryFetch(): void {
  summaryInflight = null;
}

export function getDataSummary(): Promise<ClientResult<ApiDataSummary>> {
  if (!summaryInflight) {
    summaryInflight = fetchDataSummary().then(
      (res) => res,
      (err) => {
        summaryInflight = null;
        throw err;
      },
    );
  }
  return summaryInflight;
}

export function resetCrmFetches(): void {
  resetApiDataFetch();
  resetDataSummaryFetch();
}
