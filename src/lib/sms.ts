import { apiFetch, apiUrl } from "./api";

export const SMS_ENV_NEEDED = "نیاز به env / API";
export const IRANPAYAMAK_DEFAULT_BASE = "https://api.iranpayamak.com";
export const SMS_SETTINGS_KEY = "fasihi.sms-settings";

export type SmsKind = "installment_reminder" | "renewal_reminder" | "test" | "free_text";

export type SmsStatus = {
  ok: boolean;
  configured: boolean;
  provider?: string;
  apiBase?: string;
  usernameSet?: boolean;
  passwordSet?: boolean;
  fromNumberSet?: boolean;
  error?: string;
};

export type SmsSendLogItem = {
  at?: string;
  ok: boolean;
  error?: string | null;
  code?: string | null;
  recipientCount?: number;
  recipients?: string[];
  textLength?: number;
};

export type SmsSettings = {
  apiBase: string;
  username: string;
  fromNumber: string;
  installmentReminder: boolean;
  renewalReminder: boolean;
};

export function publicSmsPlaceholders(): Pick<SmsSettings, "apiBase" | "username" | "fromNumber"> {
  return {
    apiBase: (import.meta.env.VITE_IRANPAYAMAK_BASE_URL ?? "").trim() || IRANPAYAMAK_DEFAULT_BASE,
    username: (import.meta.env.VITE_IRANPAYAMAK_USERNAME ?? "").trim(),
    fromNumber: (import.meta.env.VITE_IRANPAYAMAK_FROM ?? "").trim(),
  };
}

export function defaultSmsSettings(): SmsSettings {
  const placeholders = publicSmsPlaceholders();
  return {
    ...placeholders,
    installmentReminder: true,
    renewalReminder: true,
  };
}

export function loadSmsSettings(): SmsSettings {
  const base = defaultSmsSettings();
  try {
    const raw = localStorage.getItem(SMS_SETTINGS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<SmsSettings>;
    return {
      apiBase: typeof parsed.apiBase === "string" && parsed.apiBase.trim() ? parsed.apiBase : base.apiBase,
      username: typeof parsed.username === "string" ? parsed.username : base.username,
      fromNumber: typeof parsed.fromNumber === "string" ? parsed.fromNumber : base.fromNumber,
      installmentReminder: parsed.installmentReminder !== false,
      renewalReminder: parsed.renewalReminder !== false,
    };
  } catch {
    return base;
  }
}

export function saveSmsSettings(next: SmsSettings) {
  try {
    localStorage.setItem(SMS_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

export function buildInstallmentReminderText(name: string): string {
  const who = name.trim() || "بیمه‌گذار";
  return `${who} گرامی، یادآوری سررسید قسط از نمایندگی ۳۰۴۵ بیمه کارآفرین. برای هماهنگی با دفتر تماس بگیرید.`;
}

export function buildRenewalReminderText(name: string): string {
  const who = name.trim() || "بیمه‌گذار";
  return `${who} گرامی، موعد تمدید بیمه‌نامه نزدیک است. نمایندگی ۳۰۴۵ بیمه کارآفرین آماده تمدید است.`;
}

export async function fetchSmsStatus(): Promise<SmsStatus> {
  try {
    const res = await apiFetch(apiUrl("/api/sms/status"), { headers: { Accept: "application/json" } });
    if (!res.ok) return { ok: false, configured: false, error: SMS_ENV_NEEDED };
    const data = (await res.json()) as SmsStatus;
    const configured = Boolean(data.configured);
    return {
      ok: true,
      configured,
      provider: data.provider,
      apiBase: data.apiBase,
      usernameSet: data.usernameSet,
      passwordSet: data.passwordSet,
      fromNumberSet: data.fromNumberSet,
      error: configured ? undefined : data.error || SMS_ENV_NEEDED,
    };
  } catch {
    return { ok: false, configured: false, error: SMS_ENV_NEEDED };
  }
}

export async function sendSmsReminder(input: {
  kind: SmsKind;
  text: string;
  recipients: string[];
  dryRun?: boolean;
}): Promise<{ ok: boolean; error?: string; log?: SmsSendLogItem; dryRun?: boolean }> {
  try {
    const res = await apiFetch(apiUrl("/api/sms/send"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      log?: SmsSendLogItem;
      dryRun?: boolean;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error?.trim() || SMS_ENV_NEEDED, log: data.log };
    }
    return { ok: true, log: data.log, dryRun: Boolean(data.dryRun || input.dryRun) };
  } catch {
    return { ok: false, error: SMS_ENV_NEEDED };
  }
}

export async function fetchSmsLog(): Promise<SmsSendLogItem[]> {
  try {
    const res = await apiFetch(apiUrl("/api/sms/log"), { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: SmsSendLogItem[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}
