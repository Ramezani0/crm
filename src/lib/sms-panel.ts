import { apiFetch, apiUrl } from "./api";

export type SmsPanelSettings = {
  ok: boolean;
  provider?: string;
  providerUrl?: string;
  dryRun: boolean;
  configured: boolean;
  apiBase: string;
  usernameMasked: string;
  passwordMasked: string;
  apiKeyMasked: string;
  sender: string;
  hasUsername: boolean;
  hasPassword: boolean;
  hasApiKey: boolean;
  hasSender: boolean;
  staffNumbers: string[];
  envNames?: string[];
};

export type SmsInboxMessage = {
  id: string;
  from: string;
  body: string;
  at: string;
};

export type UrgentTask = {
  id: string;
  title: string;
  body: string;
  relatedEntity?: { label?: string; type?: string; id?: string } | null;
  assignees: string[];
  status: "in_review" | "in_progress" | "done" | string;
  statusLabel: string;
  openedAt?: string | null;
  reminderSentAt?: string | null;
  createdAt: string;
  updatedAt: string;
  unread?: boolean;
};

export const URGENT_STATUS_OPTIONS = [
  { value: "in_review", label: "درحال بررسی" },
  { value: "in_progress", label: "درحال انجام" },
  { value: "done", label: "انجام شد" },
] as const;

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

function emptySettings(): SmsPanelSettings {
  return {
    ok: false,
    dryRun: false,
    configured: false,
    apiBase: "",
    usernameMasked: "",
    passwordMasked: "",
    apiKeyMasked: "",
    sender: "",
    hasUsername: false,
    hasPassword: false,
    hasApiKey: false,
    hasSender: false,
    staffNumbers: [],
  };
}

export async function fetchSmsPanelSettings(): Promise<SmsPanelSettings> {
  try {
    const res = await apiFetch(apiUrl("/api/sms-panel/settings"), {
      headers: { Accept: "application/json" },
    });
    const data = await readJson<SmsPanelSettings>(res);
    if (!res.ok) return emptySettings();
    return {
      ...data,
      ok: true,
      dryRun: data.dryRun === true,
      staffNumbers: Array.isArray(data.staffNumbers) ? data.staffNumbers : [],
    };
  } catch {
    return emptySettings();
  }
}

export async function saveSmsPanelSettings(input: {
  username?: string;
  password?: string;
  apiKey?: string;
  sender?: string;
  apiBase?: string;
  staffNumbers?: string[];
}): Promise<{ ok: boolean; settings?: SmsPanelSettings; error?: string }> {
  try {
    const res = await apiFetch(apiUrl("/api/sms-panel/settings"), {
      method: "PUT",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await readJson<{ ok?: boolean; settings?: SmsPanelSettings; error?: string }>(res);
    return { ok: Boolean(data.ok), settings: data.settings, error: data.error };
  } catch {
    return { ok: false, error: "ذخیره تنظیمات ناموفق بود" };
  }
}

export async function testSmsPanelConnection(): Promise<{
  ok: boolean;
  connected?: boolean;
  message?: string;
  code?: string;
}> {
  try {
    const res = await apiFetch(apiUrl("/api/sms-panel/test-connection"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: "{}",
    });
    return await readJson(res);
  } catch {
    return { ok: false, connected: false, message: "ارتباط با سرور برقرار نشد" };
  }
}

export async function sendSmsPanelText(input: {
  text: string;
  recipients: string[];
}): Promise<{ ok: boolean; dryRun?: boolean; message?: string; error?: string }> {
  try {
    const res = await apiFetch(apiUrl("/api/sms-panel/send"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return await readJson(res);
  } catch {
    return { ok: false, error: "ارسال ناموفق بود" };
  }
}

export async function sendSmsPanelPattern(input: {
  pattern: string;
  params?: Record<string, string>;
  recipients: string[];
}): Promise<{ ok: boolean; dryRun?: boolean; message?: string; error?: string }> {
  try {
    const res = await apiFetch(apiUrl("/api/sms-panel/send-pattern"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return await readJson(res);
  } catch {
    return { ok: false, error: "ارسال پترن ناموفق بود" };
  }
}

export async function fetchSmsPanelInbox(): Promise<{
  ok: boolean;
  stub?: boolean;
  dryRun?: boolean;
  messages: SmsInboxMessage[];
  message?: string;
}> {
  try {
    const res = await apiFetch(apiUrl("/api/sms-panel/inbox"), {
      headers: { Accept: "application/json" },
    });
    const data = await readJson<{
      ok?: boolean;
      stub?: boolean;
      dryRun?: boolean;
      messages?: SmsInboxMessage[];
      message?: string;
    }>(res);
    return {
      ok: Boolean(data.ok),
      stub: data.stub,
      dryRun: data.dryRun,
      messages: Array.isArray(data.messages) ? data.messages : [],
      message: data.message,
    };
  } catch {
    return { ok: false, messages: [], message: "خواندن صندوق ناموفق بود" };
  }
}

export async function replySmsPanel(input: {
  to: string;
  text: string;
}): Promise<{ ok: boolean; dryRun?: boolean; message?: string; error?: string }> {
  try {
    const res = await apiFetch(apiUrl("/api/sms-panel/reply"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return await readJson(res);
  } catch {
    return { ok: false, error: "ارسال پاسخ ناموفق بود" };
  }
}

export async function fetchUrgentTasks(): Promise<UrgentTask[]> {
  try {
    const res = await apiFetch(apiUrl("/api/urgent-tasks"), {
      headers: { Accept: "application/json" },
    });
    const data = await readJson<{ items?: UrgentTask[] }>(res);
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

export async function createUrgentTask(input: {
  title: string;
  body?: string;
  relatedEntity?: { label?: string; type?: string; id?: string } | null;
  assignees?: string[];
  status?: string;
}): Promise<{ ok: boolean; task?: UrgentTask; error?: string }> {
  try {
    const res = await apiFetch(apiUrl("/api/urgent-tasks"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return await readJson(res);
  } catch {
    return { ok: false, error: "ایجاد کار ضروری ناموفق بود" };
  }
}

export async function updateUrgentTask(input: {
  id: string;
  status?: string;
  title?: string;
  body?: string;
}): Promise<{ ok: boolean; task?: UrgentTask; error?: string }> {
  try {
    const res = await apiFetch(apiUrl("/api/urgent-tasks/update"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return await readJson(res);
  } catch {
    return { ok: false, error: "به‌روزرسانی کار ضروری ناموفق بود" };
  }
}

export async function openUrgentTask(id: string): Promise<{ ok: boolean; task?: UrgentTask }> {
  try {
    const res = await apiFetch(apiUrl("/api/urgent-tasks/open"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return await readJson(res);
  } catch {
    return { ok: false };
  }
}
