import { normalizeMobile } from "./sms";

/** Inbound SMS may create essential tasks only from these numbers. */
export const SMS_INBOUND_WHITELIST = [
  "09138917291",
  "09180089780",
  "09133938543",
  "09386674005",
  "09213908576",
  "09120973209",
] as const;

export const SITE_CHANGE_NOTIFY_MOBILE = "09138917291";

export const ESSENTIAL_TASK_STATUSES = ["انجام‌شد", "نشد", "درحال‌انجام"] as const;
export type EssentialTaskStatus = (typeof ESSENTIAL_TASK_STATUSES)[number];

export const DEFAULT_ESSENTIAL_STATUS: EssentialTaskStatus = "نشد";

export type EssentialTask = {
  id: string;
  from: string;
  body: string;
  at: string;
  status: EssentialTaskStatus;
  source: "sms";
};

export function isWhitelistedMobile(raw: string | undefined | null): boolean {
  const n = normalizeMobile(raw);
  return Boolean(n) && (SMS_INBOUND_WHITELIST as readonly string[]).includes(n);
}

export function isEssentialTaskStatus(value: string): value is EssentialTaskStatus {
  return (ESSENTIAL_TASK_STATUSES as readonly string[]).includes(value);
}

export function essentialTaskFromSms(row: {
  from?: string;
  sender?: string;
  body?: string;
  text?: string;
  at?: string;
  id?: string;
}): EssentialTask | null {
  const from = normalizeMobile(row.from || row.sender);
  if (!from || !isWhitelistedMobile(from)) return null;
  const body = String(row.body ?? row.text ?? "").trim();
  if (!body) return null;
  const at = row.at || new Date().toISOString();
  return {
    id: row.id?.trim() || `SMS-${from}-${at}-${body.slice(0, 24)}`,
    from,
    body,
    at,
    status: DEFAULT_ESSENTIAL_STATUS,
    source: "sms",
  };
}

export function mergeEssentialTasks(
  existing: EssentialTask[],
  incoming: EssentialTask[],
): EssentialTask[] {
  const byId = new Map(existing.map((t) => [t.id, t]));
  for (const row of incoming) {
    const prev = byId.get(row.id);
    if (prev) continue;
    byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => +new Date(b.at) - +new Date(a.at));
}
