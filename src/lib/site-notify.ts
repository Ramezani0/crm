import { apiFetch, apiUrl } from "./api";
import { SITE_CHANGE_NOTIFY_MOBILE } from "./essential-sms";
import { SMS_ENV_NEEDED } from "./sms";

export type SiteChangeEvent = "customer_create" | "policy_edit" | "settings_save" | "staff_login";

/** Staff-login SMS is defined as a hook but not fired from demo login until staff auth is live. */
export const STAFF_LOGIN_NOTIFY_ENABLED = false;

const EVENT_LABEL: Record<SiteChangeEvent, string> = {
  customer_create: "مشتری جدید",
  policy_edit: "ویرایش بیمه‌نامه",
  settings_save: "ذخیره تنظیمات",
  staff_login: "ورود کارکنان",
};

export function formatSiteChangeSms(event: SiteChangeEvent, summary: string): string {
  const detail = summary.trim();
  if (!detail) return "";
  return `CRM فصیحی — ${EVENT_LABEL[event]}: ${detail}`.slice(0, 700);
}

export async function postSiteChangeNotify(
  event: SiteChangeEvent,
  summary: string,
): Promise<{ ok: boolean; stub?: boolean; error?: string }> {
  const text = formatSiteChangeSms(event, summary);
  if (!text) return { ok: false, error: "متن اعلان خالی است" };
  try {
    const res = await apiFetch(apiUrl("/api/sms/notify"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ event, summary: detailOrSummary(summary) }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      stub?: boolean;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, stub: data.stub, error: data.error?.trim() || SMS_ENV_NEEDED };
    }
    return { ok: true, stub: data.stub };
  } catch {
    return { ok: false, stub: true, error: SMS_ENV_NEEDED };
  }
}

function detailOrSummary(summary: string) {
  return summary.trim();
}

/** Fire-and-forget notify to the locked agency mobile. Never blocks CRM mutations. */
export function notifySiteChange(event: SiteChangeEvent, summary: string) {
  void postSiteChangeNotify(event, summary);
}

export function notifyStaffLoginLater(username: string) {
  if (!STAFF_LOGIN_NOTIFY_ENABLED) return;
  notifySiteChange("staff_login", username.trim() || "staff");
}

export function notifySettingsSaved() {
  notifySiteChange("settings_save", "تنظیمات دفتر نمایندگی ذخیره شد");
}

export { SITE_CHANGE_NOTIFY_MOBILE };
