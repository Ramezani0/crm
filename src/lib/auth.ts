/**
 * Phase 1 staff auth: local demo/staff gate + live cookie session.
 * Never hardcode or commit a demo password.
 * Set VITE_DEMO_PASSWORD in local/VPS env when you want a specific shared demo secret.
 * Live cookie: `fasihi_session` (HttpOnly; Secure; SameSite=Lax) via POST /api/auth/login.
 */
import { apiFetch, apiUrl } from "./api";

export function verifyDemoPassword(input: string): boolean {
  const expected = import.meta.env.VITE_DEMO_PASSWORD;
  if (typeof expected === "string" && expected.length > 0) {
    return input === expected;
  }
  return input.trim().length > 0;
}

export type ApiLoginOk = { ok: true };
export type ApiLoginErr = { ok: false; error: string };
export type ApiLoginResult = ApiLoginOk | ApiLoginErr;

/** POST /api/auth/login — sets HttpOnly `fasihi_session` cookie when credentials are valid. */
export async function apiLogin(username: string, password: string): Promise<ApiLoginResult> {
  const user = username.trim();
  const pass = password;
  if (!user || !pass) {
    return { ok: false, error: "نام کاربری و رمز عبور لازم است." };
  }
  try {
    const res = await apiFetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass }),
      signal: AbortSignal.timeout(15_000),
    });
    let message = "";
    try {
      const body = (await res.json()) as { error?: string; ok?: boolean };
      if (body?.error) message = String(body.error);
    } catch {
      /* non-JSON */
    }
    if (!res.ok) {
      if (res.status === 401) {
        return { ok: false, error: message || "نام کاربری یا رمز عبور نادرست است." };
      }
      if (res.status === 400) {
        return { ok: false, error: message || "نام کاربری و رمز عبور لازم است." };
      }
      return { ok: false, error: message || `ورود سرور ناموفق بود (HTTP ${res.status}).` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "ارتباط با سرور احراز هویت برقرار نشد." };
  }
}

/** POST /api/auth/logout — clears cookie when present; 404/network are OK. */
export async function apiLogout(): Promise<void> {
  try {
    await apiFetch(apiUrl("/api/auth/logout"), {
      method: "POST",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    /* optional endpoint / offline */
  }
}

/**
 * Cheap authed ping. Live `/api/data/summary` returns 401 without `fasihi_session`.
 * Used on hydrate to avoid a shell that shows currentUser with an empty CRM.
 */
export async function pingAuthedSession(): Promise<boolean> {
  try {
    const res = await apiFetch(apiUrl("/api/data/summary"), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
