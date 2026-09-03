import { createFileRoute } from "@tanstack/react-router";
import { AppShell, SectionCard } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { ROLES } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "تنظیمات سامانه | CRM فصیحی" },
      { name: "description", content: "تنظیمات دفتر بیمه، یادآوری‌ها، پیامک و پیکربندی عمومی سامانه." },
      { property: "og:title", content: "تنظیمات سامانه" },
      { property: "og:description", content: "پیکربندی اطلاعات دفتر، یادآوری‌ها و ترجیحات کاربری." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { currentUser } = useStore();
  const role = ROLES.find((r) => r.id === currentUser?.role)?.label;

  return (
    <AppShell title="تنظیمات" subtitle={role ? `نقش شما: ${role}` : undefined} permission="settings.manage">
      <SectionCard title="اطلاعات دفتر نمایندگی">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="agency">نام دفتر</Label>
            <Input id="agency" defaultValue="دفتر بیمه فصیحی" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="code">کد نمایندگی</Label>
            <Input id="code" defaultValue="۳۳۸۲۱" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tel">تلفن</Label>
            <Input id="tel" defaultValue="۰۲۱-۸۸۵۵۴۴۳۳" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="addr">نشانی</Label>
            <Input id="addr" defaultValue="تهران، خیابان ولیعصر، پلاک ۱۲۰" />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="یادآوری‌ها و اعلان‌ها">
        {[
          ["یادآوری پیامکی سررسید اقساط", true],
          ["هشدار اقساط معوق بیش از ۷ روز", true],
          ["یادآوری تمدید بیمه‌نامه (۳۰ روز قبل)", true],
          ["گزارش هفتگی مدیریتی از طریق ایمیل", false],
        ].map(([label, on]) => (
          <div key={label as string} className="flex items-center justify-between border-b border-border/40 py-3 text-sm last:border-0">
            <span>{label}</span>
            <Switch defaultChecked={on as boolean} aria-label={label as string} />
          </div>
        ))}
      </SectionCard>
    </AppShell>
  );
}
