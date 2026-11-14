import { afterEach, describe, expect, test } from "bun:test";
import { apiLogin, apiLogout, pingAuthedSession } from "./auth";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("apiLogin", () => {
  test("POSTs /api/auth/login with credentials include", async () => {
    let seen: RequestInit | undefined;
    let url = "";
    globalThis.fetch = (async (input, init) => {
      url = String(input);
      seen = init;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const res = await apiLogin("ceo", "secret");
    expect(res.ok).toBe(true);
    expect(url).toContain("/api/auth/login");
    expect(seen?.method).toBe("POST");
    expect(seen?.credentials).toBe("include");
    expect(JSON.parse(String(seen?.body))).toEqual({ username: "ceo", password: "secret" });
  });

  test("surfaces 401 without pretending success", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "نام کاربری یا رمز عبور نادرست است" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    const res = await apiLogin("ceo", "wrong");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("نادرست");
  });
});

describe("apiLogout", () => {
  test("POSTs logout with credentials; 404 is fine", async () => {
    let seen: RequestInit | undefined;
    globalThis.fetch = (async (_input, init) => {
      seen = init;
      return new Response("missing", { status: 404 });
    }) as typeof fetch;
    await apiLogout();
    expect(seen?.method).toBe("POST");
    expect(seen?.credentials).toBe("include");
  });
});

describe("pingAuthedSession", () => {
  test("true on 200 summary", async () => {
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toContain("/api/data/summary");
      expect(init?.credentials).toBe("include");
      return new Response(JSON.stringify({ customers: [] }), { status: 200 });
    }) as typeof fetch;
    expect(await pingAuthedSession()).toBe(true);
  });

  test("false on 401", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "ورود لازم است" }), { status: 401 })) as typeof fetch;
    expect(await pingAuthedSession()).toBe(false);
  });
});
