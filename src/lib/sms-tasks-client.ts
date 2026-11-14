import { apiFetch, apiUrl } from "./api";
import {
  essentialTaskFromSms,
  isEssentialTaskStatus,
  mergeEssentialTasks,
  type EssentialTask,
  type EssentialTaskStatus,
} from "./essential-sms";

export async function fetchEssentialTasks(sync = false): Promise<{
  ok: boolean;
  stub?: boolean;
  tasks: EssentialTask[];
  ingested?: number;
  skipped?: number;
  error?: string;
}> {
  try {
    const res = await apiFetch(`${apiUrl("/api/sms/tasks")}${sync ? "?sync=1" : ""}`, {
      headers: { Accept: "application/json" },
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      stub?: boolean;
      ingested?: number;
      skipped?: number;
      error?: string;
      tasks?: unknown[];
      messages?: unknown[];
    };
    const fromTasks = Array.isArray(data.tasks) ? data.tasks : [];
    const fromInbox = Array.isArray(data.messages) ? data.messages : [];
    const parsed: EssentialTask[] = [];
    for (const row of [...fromTasks, ...fromInbox]) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const existingStatus =
        typeof rec.status === "string" && isEssentialTaskStatus(rec.status)
          ? rec.status
          : undefined;
      const built = essentialTaskFromSms({
        from: String(rec.from || rec.sender || ""),
        body: String(rec.body || rec.text || ""),
        at: rec.at ? String(rec.at) : undefined,
        id: rec.id ? String(rec.id) : undefined,
      });
      if (!built) continue;
      parsed.push(existingStatus ? { ...built, status: existingStatus } : built);
    }
    return {
      ok: data.ok !== false,
      stub: data.stub,
      tasks: mergeEssentialTasks([], parsed),
      ingested: data.ingested,
      skipped: data.skipped,
      error: data.error,
    };
  } catch {
    return { ok: false, stub: true, tasks: [] };
  }
}

export async function patchEssentialTaskStatus(
  id: string,
  status: EssentialTaskStatus,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiFetch(apiUrl("/api/sms/tasks"), {
      method: "PATCH",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error };
    return { ok: true };
  } catch {
    return { ok: false, error: "به‌روزرسانی وضعیت ممکن نیست." };
  }
}
