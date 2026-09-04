import { createFileRoute } from "@tanstack/react-router";
import { AppShell, SectionCard } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "اعلان‌ها | CRM فصیحی" },
      { name: "description", content: "اعلان‌های سامانه درباره اقساط معوق، انقضای بیمه‌نامه و پرداخت‌های ثبت‌شده." },
      { property: "og:title", content: "اعلان‌های سامانه" },
      { property: "og:description", content: "پیگیری هشدارها و رویدادهای مهم دفتر بیمه." },
    ],
  }),
  component: NotificationsPage,
});

const tone: Record<string, string> = {
  info: "border-info/30 bg-info/10",
  warning: "border-warning/30 bg-warning/10",
  success: "border-success/30 bg-success/10",
  danger: "border-destructive/30 bg-destructive/10",
};

function NotificationsPage() {
  const { notifications, markNotification, markAllNotifications } = useStore();

  return (
    <AppShell
      title="اعلان‌ها"
      permission="notifications.view"
      actions={
        <Button size="sm" variant="outline" onClick={markAllNotifications}>
          علامت‌گذاری همه به‌عنوان خوانده‌شده
        </Button>
      }
    >
      <SectionCard>
        {notifications.length === 0 ? (
          <EmptyState title="اعلانی وجود ندارد" />
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li key={n.id} className={`rounded-lg border px-3 py-2 text-sm ${tone[n.kind]} ${n.read ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-2">
                  <p className="flex-1 font-medium">{n.title}</p>
                  <button className="text-xs text-primary" onClick={() => markNotification(n.id, !n.read)}>
                    {n.read ? "خوانده‌نشده" : "خوانده شد"}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{n.body}</p>
                <p className="text-[11px] text-muted-foreground">{formatDate(n.date)}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </AppShell>
  );
}
