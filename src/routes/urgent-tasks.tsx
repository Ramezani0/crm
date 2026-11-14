import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { RecordActions } from "@/components/record-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toFa } from "@/lib/format";
import {
  URGENT_STATUS_OPTIONS,
  createUrgentTask,
  fetchUrgentTasks,
  openUrgentTask,
  updateUrgentTask,
  type UrgentTask,
} from "@/lib/sms-panel";

export const Route = createFileRoute("/urgent-tasks")({
  head: () => ({
    meta: [
      { title: "کارهای ضروری | CRM فصیحی" },
      { name: "description", content: "مدیریت کارهای ضروری با اطلاع پیامکی کارکنان." },
    ],
  }),
  component: UrgentTasksPage,
});

function UrgentTasksPage() {
  const [items, setItems] = useState<UrgentTask[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [related, setRelated] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const reload = async () => {
    setItems(await fetchUrgentTasks());
  };

  useEffect(() => {
    void reload();
  }, []);

  const unreadCount = items.filter((t) => t.unread).length;

  return (
    <AppShell
      title="کارهای ضروری"
      subtitle={`${toFa(items.length)} کار · ${toFa(unreadCount)} خوانده‌نشده`}
      permission="tasks.view"
    >
      <SectionCard
        title="ثبت کار ضروری"
        description="با تغییر وضعیت، پیامک به لیست کارکنان ارسال می‌شود (ارسال زنده وقتی SMS_DRY_RUN=0)."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ut-title">عنوان</Label>
            <Input id="ut-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ut-body">شرح</Label>
            <Textarea id="ut-body" className="min-h-24" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ut-related">موجودیت مرتبط (اختیاری)</Label>
            <Input
              id="ut-related"
              value={related}
              onChange={(e) => setRelated(e.target.value)}
              placeholder="مثلاً بیمه‌نامه / مشتری / تمدید"
            />
          </div>
        </div>
        <Button
          type="button"
          className="mt-3"
          disabled={busy || !title.trim()}
          onClick={async () => {
            setBusy(true);
            const result = await createUrgentTask({
              title: title.trim(),
              body: body.trim(),
              relatedEntity: related.trim() ? { label: related.trim() } : null,
            });
            setBusy(false);
            if (result.ok) {
              setTitle("");
              setBody("");
              setRelated("");
              setNote("کار ثبت شد و پیامک وضعیت ارسال شد.");
              await reload();
            } else {
              setNote(result.error || "ثبت ناموفق");
            }
          }}
        >
          ثبت کار ضروری
        </Button>
        {note ? <p className="mt-2 text-sm text-muted-foreground">{note}</p> : null}
      </SectionCard>

      <SectionCard title="فهرست کارها" description="بدون Three.js — جدول RTL لوکس با نشان خوانده/نخوانده">
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-emerald-50/90 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-50">
              <tr>
                <th className="px-3 py-2 text-start">وضعیت خواندن</th>
                <th className="px-3 py-2 text-start">عنوان</th>
                <th className="px-3 py-2 text-start">وضعیت</th>
                <th className="px-3 py-2 text-start">مرتبط</th>
                <th className="px-3 py-2 text-start">اقدام</th>
                <th className="px-3 py-2 text-start">پیامک</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    کار ضروری ثبت نشده
                  </td>
                </tr>
              ) : (
                items.map((task) => (
                  <tr key={task.id} className="border-t border-border/40 align-top">
                    <td className="px-3 py-2">
                      {task.unread ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          نخوانده
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-900">
                          خوانده
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{task.title}</p>
                      {task.body ? <p className="mt-1 text-xs text-muted-foreground">{task.body}</p> : null}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                        value={task.status}
                        aria-label={`وضعیت ${task.title}`}
                        onChange={async (e) => {
                          setBusy(true);
                          await updateUrgentTask({ id: task.id, status: e.target.value });
                          setBusy(false);
                          await reload();
                        }}
                      >
                        {URGENT_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{task.relatedEntity?.label || "—"}</td>
                    <td className="px-3 py-2">
                      {task.unread ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            await openUrgentTask(task.id);
                            setBusy(false);
                            await reload();
                          }}
                        >
                          علامت خوانده
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <RecordActions
                        contextLabel={task.title}
                        hideSave
                        size="sm"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
