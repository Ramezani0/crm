import { createFileRoute } from "@tanstack/react-router";
import { AppShell, SectionCard } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { ROLES } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { IranPayamakPanel } from "@/components/sms-settings-panel";

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
            <Input id="agency" defaultValue="نمایندگی بیمه کارآفرین — خانم فاطمه فصیحی" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="code">کد نمایندگی</Label>
            <Input id="code" defaultValue="۳۰۴۵" />
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
        <div className="flex items-center justify-between py-3 text-sm">
          <span>گزارش هفتگی مدیریتی از طریق ایمیل</span>
          <Switch defaultChecked={false} aria-label="گزارش هفتگی مدیریتی از طریق ایمیل" />
        </div>
      </SectionCard>

      <SectionCard title="ایران پیامک" description="وضعیت env سرور — ارسال متن آزاد از داخل پرونده ۳۶۵">
        <IranPayamakPanel />
        <p className="mt-3 text-sm text-muted-foreground">
          پنل کامل پیامک و تست اتصال:{" "}
          <a className="font-medium text-emerald-700 underline-offset-4 hover:underline" href="/sms-panel">
            /sms-panel
          </a>
          {" "}· کارهای ضروری:{" "}
          <a className="font-medium text-emerald-700 underline-offset-4 hover:underline" href="/urgent-tasks">
            /urgent-tasks
          </a>
        </p>
      </SectionCard>
    </AppShell>
  );
}
