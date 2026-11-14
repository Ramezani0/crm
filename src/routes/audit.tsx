import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, SectionCard } from "@/components/app-shell";
import { fetchAudit } from "@/lib/persist-api";
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

type AuditRow = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  ip: string;
  date: string;
};

function AuditPage() {
  const { audit } = useStore();
  const [remote, setRemote] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAudit({ limit: 200 })
      .then((res) => {
        if (cancelled || !res || !("ok" in res) || !res.ok || !Array.isArray(res.items)) return;
        setRemote(
          res.items.map((a) => ({
            id: String(a.id),
            actor: a.actor || a.performedBy || "سیستم",
            action: a.action,
            entity: a.entity || `${a.tableName ?? ""}:${a.recordId ?? ""}`,
            ip: a.ip || "",
            date: a.date || a.createdAt || "",
          })),
        );
      })
      .catch(() => {
        /* keep local store audit */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows: AuditRow[] =
    remote && remote.length > 0
      ? remote
      : audit.map((a) => ({
          id: a.id,
          actor: a.actor,
          action: a.action,
          entity: a.entity,
          ip: a.ip,
          date: a.date,
        }));

  return (
    <AppShell title="گزارش رخدادها" subtitle={`${toFa(rows.length)} رویداد ثبت‌شده`} permission="audit.view">
      <SectionCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-base">
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
              {rows.map((a) => (
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
