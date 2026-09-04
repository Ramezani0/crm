import { createFileRoute } from "@tanstack/react-router";
import { AppShell, SectionCard } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/format";
import { ROLES, ROLE_PERMISSIONS, type RoleId } from "@/lib/types";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "کاربران و نقش‌ها | CRM فصیحی" },
      { name: "description", content: "مدیریت کاربران سامانه و سطوح دسترسی مدیرعامل، مدیر داخلی، کارشناس فروش و حسابداری." },
      { property: "og:title", content: "کاربران و سطوح دسترسی" },
      { property: "og:description", content: "تعریف نقش‌ها و کنترل دسترسی اعضای دفتر بیمه." },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const { users, updateUserRole, toggleUserActive } = useStore();

  return (
    <AppShell title="کاربران و نقش‌ها" permission="users.manage">
      <SectionCard title="کاربران سامانه">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-2 text-start">نام</th>
                <th className="p-2 text-start">نام کاربری</th>
                <th className="p-2 text-start">نقش</th>
                <th className="p-2 text-start">آخرین ورود</th>
                <th className="p-2 text-start">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/50">
                  <td className="p-2 font-medium">{u.name}</td>
                  <td className="p-2 text-xs text-muted-foreground">{u.username}</td>
                  <td className="p-2">
                    <select
                      aria-label={`نقش ${u.name}`}
                      className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                      value={u.role}
                      onChange={(e) => updateUserRole(u.id, e.target.value as RoleId)}
                    >
                      {ROLES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">{formatDate(u.lastLogin)}</td>
                  <td className="p-2">
                    <button className="text-xs text-primary" onClick={() => toggleUserActive(u.id)}>
                      {u.active ? "فعال — غیرفعال کن" : "غیرفعال — فعال کن"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="ماتریس دسترسی نقش‌ها">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {ROLES.map((r) => (
            <div key={r.id} className="rounded-xl border border-border/60 p-3">
              <p className="font-semibold">{r.label}</p>
              <p className="mb-2 text-[11px] text-muted-foreground">{r.description}</p>
              <ul className="space-y-1 text-[11px] text-muted-foreground">
                {ROLE_PERMISSIONS[r.id].map((p) => (
                  <li key={p} className="num">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
