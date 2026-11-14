import { afterEach, describe, expect, test } from "bun:test";
import {
  apiDataErrorMessage,
  apiFetch,
  fetchApiData,
  fetchCustomerDossier,
  fetchCustomersPage,
  fetchDataSummary,
  getApiData,
  isTimeoutError,
  MOCK_DATA,
  resetApiDataFetch,
  resetCrmFetches,
} from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetCrmFetches();
});

describe("apiDataErrorMessage", () => {
  test("maps TimeoutError to a clear /api/data timeout string", () => {
    const err = Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    });
    expect(isTimeoutError(err)).toBe(true);
    expect(apiDataErrorMessage(err)).toContain("/api/data");
    expect(apiDataErrorMessage(err)).toContain("زمان انتظار");
  });
});

describe("fetchApiData", () => {
  test("retries once after timeout then throws", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw Object.assign(new Error("The operation was aborted due to timeout"), {
        name: "TimeoutError",
      });
    }) as typeof fetch;

    await expect(fetchApiData()).rejects.toMatchObject({ name: "TimeoutError" });
    expect(calls).toBe(2);
  });

  test("hydrates live JSON without falling back to mock", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ customers: [], policies: [], installments: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    const res = await fetchApiData();
    expect(res.source).toBe("live");
    expect(res.data.customers).toEqual([]);
  });
});

describe("getApiData", () => {
  test("shares inflight and reset starts a new fetch", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify(MOCK_DATA), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const a = getApiData();
    const b = getApiData();
    expect(a).toBe(b);
    await a;
    expect(calls).toBe(1);
    resetApiDataFetch();
    await getApiData();
    expect(calls).toBe(2);
  });
});

describe("slim endpoints", () => {
  test("fetchDataSummary accepts customers without installments", async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input);
      expect(url).toContain("/api/data/summary");
      return new Response(JSON.stringify({ customers: MOCK_DATA.customers, counts: { customers: 1, policies: 0, installments: 0 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    const res = await fetchDataSummary();
    expect(res.source).toBe("live");
    expect(res.data.customers).toHaveLength(1);
    expect("installments" in res.data).toBe(false);
    expect(res.data.counts).toEqual({ customers: 1, policies: 0, installments: 0 });
  });

  test("fetchDataSummary preserves non-zero counts for KPI first-paint", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          customers: [],
          counts: { customers: 2489, policies: 9052, installments: 29457 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;
    const res = await fetchDataSummary();
    expect(res.source).toBe("live");
    expect(res.data.counts?.policies).toBe(9052);
    expect(res.data.counts?.installments).toBe(29457);
  });

  test("fetchCustomerDossier hydrates one holder", async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input);
      expect(url).toContain("/api/customers/C-0011748206");
      return new Response(
        JSON.stringify({
          customer: { ...MOCK_DATA.customers[0], id: "C-0011748206" },
          policies: MOCK_DATA.policies,
          installments: MOCK_DATA.installments,
          holderCodes: ["88012"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;
    const res = await fetchCustomerDossier("C-0011748206");
    expect(res.data.customer.id).toBe("C-0011748206");
    expect(res.data.policies).toHaveLength(1);
  });

  test("fetchCustomersPage hits /api/customers with limit=50", async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input);
      expect(url).toContain("/api/customers?limit=50");
      expect(url).not.toContain("/api/data");
      return new Response(
        JSON.stringify({
          customers: [{ id: "C-0011748206", fullName: "آزمون", nationalId: "0011748206", holderCode: "H-1", holder_code: "H-1", mobile: "09120000000" }],
          total: 1352,
          limit: 50,
          offset: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;
    const res = await fetchCustomersPage();
    expect(res.data.total).toBe(1352);
    expect(res.data.customers[0].id).toBe("C-0011748206");
  });
});

describe("apiFetch credentials", () => {
  test("defaults credentials to include", async () => {
    let seen: RequestInit | undefined;
    globalThis.fetch = (async (_input, init) => {
      seen = init;
      return new Response(JSON.stringify({ customers: [], policies: [], installments: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    await apiFetch("/api/data");
    expect(seen?.credentials).toBe("include");
    const res = await fetchApiData();
    expect(res.source).toBe("live");
    expect(seen?.credentials).toBe("include");
  });
});
