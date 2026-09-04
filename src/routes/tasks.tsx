import { createFileRoute } from "@tanstack/react-router";
import { AppShell, SectionCard } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { formatDate, toFa } from "@/lib/format";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/states";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "وظایف و یادآوری‌ها | CRM فصیحی" },
      { name: "description", content: "مدیریت وظایف پیگیری مشتریان، یادآوری تمدید و تماس‌های وصول مطالبات." },
      { property: "og:title", content: "وظایف و یادآوری‌ها" },
      { property: "og:description", content: "برنامه‌ریزی پیگیری‌های روزانه تیم فروش و حسابداری." },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const { tasks, toggleTask, customers } = useStore();
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const name = (id?: string) => customers.find((c) => c.id === id)?.fullName;

  return (
    <AppShell title="وظایف و یادآوری‌ها" subtitle={`${toFa(open.length)} وظیفه باز`} permission="tasks.view">
      <SectionCard title="وظایف باز">
        {open.length === 0 ? (
          <EmptyState title="وظیفه بازی وجود ندارد" />
        ) : (
          <ul className="space-y-2">
            {open.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
                <Checkbox checked={t.done} onCheckedChange={() => toggleTask(t.id)} aria-label={`اتمام ${t.title}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {name(t.relatedCustomerId)} — سررسید {formatDate(t.dueDate)} — {t.assignee}
                  </p>
                </div>
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px]">{t.priority}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="انجام‌شده">
        <ul className="space-y-2">
          {done.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2 text-sm text-muted-foreground">
              <Checkbox checked onCheckedChange={() => toggleTask(t.id)} aria-label={`بازگشایی ${t.title}`} />
              <span className="line-through">{t.title}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </AppShell>
  );
}
