import { createFileRoute } from "@tanstack/react-router";
import { AppShell, SectionCard } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { formatDate, toFa } from "@/lib/format";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "گزارش رخدادها | CRM فصیحی" },
      { name: "description", content: "تاریخچه رخدادهای امنیتی و عملیاتی کاربران سامانه مدیریت بیمه فصیحی." },
      { property: "og:title", content: "گزارش رخدادها" },
      { property: "og:description", content: "ردیابی فعالیت کاربران و تغییرات حساس در سامانه." },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { audit } = useStore();
  return (
    <AppShell title="گزارش رخدادها" subtitle={`${toFa(audit.length)} رویداد ثبت‌شده`} permission="audit.view">
      <SectionCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-2 text-start">کاربر</th>
                <th className="p-2 text-start">رخداد</th>
                <th className="p-2 text-start">موجودیت</th>
                <th className="p-2 text-start">IP</th>
                <th className="p-2 text-start">تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-b border-border/50">
                  <td className="p-2 font-medium">{a.actor}</td>
                  <td className="p-2">{a.action}</td>
                  <td className="num p-2 text-xs text-muted-foreground">{a.entity}</td>
                  <td className="num p-2 text-xs text-muted-foreground">{a.ip}</td>
                  <td className="p-2 text-xs text-muted-foreground">{formatDate(a.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
