import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  SMS_ENV_NEEDED,
  fetchSmsStatus,
  loadSmsSettings,
  saveSmsSettings,
  type SmsSettings,
  type SmsStatus,
} from "@/lib/sms";

/** Light settings skeleton only — whitelist / auto-send / live dispatch are later PRs. */
export function IranPayamakPanel() {
  const [settings, setSettings] = useState<SmsSettings>(() => loadSmsSettings());
  const [status, setStatus] = useState<SmsStatus | null>(null);

  useEffect(() => {
    saveSmsSettings(settings);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    fetchSmsStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const envNeeded = !status?.configured;

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>ایران پیامک — اسکلت تنظیمات</AlertTitle>
        <AlertDescription>
          فقط برچسب‌های UI و وضعیت env. رمز در git نیست. ارسال متن آزاد از پرونده ۳۶۵ انجام می‌شود.
          {envNeeded ? (
            <span className="mt-2 block font-semibold text-warning">{SMS_ENV_NEEDED}</span>
          ) : (
            <span className="mt-2 block text-success">env سرور دیده می‌شود — ارسال از پرونده ۳۶۵ فعال است</span>
          )}
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="sms-base">آدرس پایه API</Label>
          <Input
            id="sms-base"
            dir="ltr"
            className="font-mono text-sm"
            value={settings.apiBase}
            onChange={(e) => setSettings((s) => ({ ...s, apiBase: e.target.value }))}
            placeholder="https://api.iranpayamak.com"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sms-user">نام کاربری (نمایشی)</Label>
          <Input
            id="sms-user"
            dir="ltr"
            value={settings.username}
            onChange={(e) => setSettings((s) => ({ ...s, username: e.target.value }))}
            placeholder="فقط برچسب UI — رمز نیست"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="sms-from">شماره خط / فرستنده</Label>
          <Input
            id="sms-from"
            dir="ltr"
            className="font-mono"
            value={settings.fromNumber}
            onChange={(e) => setSettings((s) => ({ ...s, fromNumber: e.target.value }))}
            placeholder="مثلاً ۵۰۰۰…"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between border-b border-border/40 py-3 text-sm">
          <span>یادآوری پیامکی سررسید اقساط (اسکلت)</span>
          <Switch
            checked={settings.installmentReminder}
            onCheckedChange={(on) => setSettings((s) => ({ ...s, installmentReminder: on }))}
            aria-label="یادآوری پیامکی سررسید اقساط"
          />
        </div>
        <div className="flex items-center justify-between py-3 text-sm">
          <span>یادآوری تمدید بیمه‌نامه (اسکلت)</span>
          <Switch
            checked={settings.renewalReminder}
            onCheckedChange={(on) => setSettings((s) => ({ ...s, renewalReminder: on }))}
            aria-label="یادآوری تمدید بیمه‌نامه"
          />
        </div>
      </div>
    </div>
  );
}
