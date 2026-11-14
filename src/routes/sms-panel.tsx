import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Inbox, MessageSquare, Send, Settings2, ShieldCheck } from "lucide-react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { BrandMark } from "@/components/brand-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RecordActions } from "@/components/record-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BRAND } from "@/lib/brand";
import {
  fetchSmsPanelInbox,
  fetchSmsPanelSettings,
  replySmsPanel,
  saveSmsPanelSettings,
  sendSmsPanelPattern,
  sendSmsPanelText,
  testSmsPanelConnection,
  type SmsInboxMessage,
  type SmsPanelSettings,
} from "@/lib/sms-panel";

export const Route = createFileRoute("/sms-panel")({
  head: () => ({
    meta: [
      { title: "پنل پیامک | CRM فصیحی" },
      { name: "description", content: "پنل ایران پیامک — تنظیمات، ارسال و صندوق ورودی." },
    ],
  }),
  component: SmsPanelPage,
});

function SmsPanelPage() {
  const [settings, setSettings] = useState<SmsPanelSettings | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [sender, setSender] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [staffText, setStaffText] = useState("");
  const [connMsg, setConnMsg] = useState<string | null>(null);
  const [connOk, setConnOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const [sendTo, setSendTo] = useState("");
  const [sendBody, setSendBody] = useState("");
  const [patternId, setPatternId] = useState("");
  const [patternParams, setPatternParams] = useState("");
  const [sendMsg, setSendMsg] = useState<string | null>(null);

  const [inbox, setInbox] = useState<SmsInboxMessage[]>([]);
  const [inboxNote, setInboxNote] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replyMsg, setReplyMsg] = useState<string | null>(null);

  const reloadSettings = async () => {
    const next = await fetchSmsPanelSettings();
    setSettings(next);
    setSender(next.sender || "");
    setApiBase(next.apiBase || "");
    setStaffText((next.staffNumbers || []).join("\n"));
  };

  useEffect(() => {
    void reloadSettings();
  }, []);

  const dryRun = settings?.dryRun === true;

  return (
    <AppShell title="پنل پیامک" subtitle="ایران پیامک — تنظیمات، ارسال و صندوق" permission="settings.manage">
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-700/25 bg-gradient-to-l from-amber-50/90 to-emerald-50 px-4 py-3 dark:from-amber-950/25 dark:to-emerald-950/40">
        <BrandMark size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">پنل پیامک</p>
          <p className="font-mono text-lg font-bold tracking-wider text-amber-700 dark:text-amber-300" dir="ltr">
            {BRAND.agencyCode}
          </p>
        </div>
        <a
          className="ms-auto text-xs text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-200"
          href="https://iranpayamak.com/"
          target="_blank"
          rel="noreferrer"
        >
          iranpayamak.com
        </a>
      </div>

      {dryRun ? (
        <Alert className="mb-4 border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/50 dark:text-amber-50">
          <AlertTitle>حالت آزمایشی (SMS_DRY_RUN=1)</AlertTitle>
          <AlertDescription>
            سرور در حالت آزمایشی است — پیامک واقعی ارسال نمی‌شود. با SMS_DRY_RUN=0 ارسال زنده است.
          </AlertDescription>
        </Alert>
      ) : null}

      <SectionCard
        title="تنظیمات ایران پیامک"
        description="ورود دستی مدارک؛ ذخیره روی سرور. GET همیشه ماسک‌شده است — هرگز در git/لاگ."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="sms-user">نام کاربری</Label>
            <Input
              id="sms-user"
              dir="ltr"
              autoComplete="off"
              placeholder={settings?.usernameMasked || "مقدار جدید"}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sms-pass">رمز / توکن</Label>
            <Input
              id="sms-pass"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              placeholder={settings?.passwordMasked ? "•••• ذخیره شده" : "مقدار جدید"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sms-key">API Key (اختیاری)</Label>
            <Input
              id="sms-key"
              dir="ltr"
              autoComplete="off"
              placeholder={settings?.apiKeyMasked || "اختیاری"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sms-sender">شماره فرستنده</Label>
            <Input
              id="sms-sender"
              dir="ltr"
              className="font-mono"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="sms-base">آدرس پایه API</Label>
            <Input
              id="sms-base"
              dir="ltr"
              className="font-mono text-sm"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="https://api.iranpayamak.com"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="sms-staff">شماره کارکنان (هر خط یکی)</Label>
            <Textarea
              id="sms-staff"
              dir="ltr"
              className="min-h-28 font-mono text-sm"
              value={staffText}
              onChange={(e) => setStaffText(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const staffNumbers = staffText
                .split(/[\n,،\s]+/)
                .map((s) => s.trim())
                .filter(Boolean);
              const result = await saveSmsPanelSettings({
                username: username || undefined,
                password: password || undefined,
                apiKey: apiKey || undefined,
                sender: sender || undefined,
                apiBase: apiBase || undefined,
                staffNumbers,
              });
              setBusy(false);
              setUsername("");
              setPassword("");
              setApiKey("");
              setConnOk(result.ok);
              setConnMsg(result.ok ? "تنظیمات ذخیره شد." : result.error || "ذخیره ناموفق");
              if (result.ok) await reloadSettings();
            }}
          >
            <Settings2 className="size-4" />
            ثبت
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await testSmsPanelConnection();
              setBusy(false);
              const ok = Boolean(result.ok || result.connected);
              setConnOk(ok);
              setConnMsg(result.message || (ok ? "اتصال برقرار است" : "اتصال ناموفق"));
            }}
          >
            <ShieldCheck className="size-4" />
            تست اتصال
          </Button>
          {connMsg ? (
            <span className={connOk ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-red-700"}>
              {connMsg}
            </span>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="ارسال و صندوق ورودی"
        description="بدون Three.js — فرم و جدول RTL لوکس"
        actions={<RecordActions hideSave contextLabel="پنل پیامک" />}
      >
        <Tabs defaultValue="send">
          <TabsList className="mb-3">
            <TabsTrigger value="send">
              <Send className="size-3.5" />
              متن آزاد
            </TabsTrigger>
            <TabsTrigger value="pattern">
              <MessageSquare className="size-3.5" />
              پترن
            </TabsTrigger>
            <TabsTrigger value="inbox">
              <Inbox className="size-3.5" />
              صندوق
            </TabsTrigger>
          </TabsList>

          <TabsContent value="send" className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="send-to">گیرنده(ها)</Label>
              <Input
                id="send-to"
                dir="ltr"
                className="font-mono"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                placeholder="0912… ، 0935…"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="send-body">متن</Label>
              <Textarea
                id="send-body"
                className="min-h-28"
                value={sendBody}
                onChange={(e) => setSendBody(e.target.value)}
              />
            </div>
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const recipients = sendTo.split(/[,،\s]+/).filter(Boolean);
                const result = await sendSmsPanelText({ text: sendBody, recipients });
                setBusy(false);
                setSendMsg(
                  result.ok
                    ? result.dryRun
                      ? result.message || "آزمایشی — ارسال واقعی نشد"
                      : "ارسال شد"
                    : result.error || "ناموفق",
                );
              }}
            >
              ارسال
            </Button>
            {sendMsg ? <p className="text-sm text-muted-foreground">{sendMsg}</p> : null}
          </TabsContent>

          <TabsContent value="pattern" className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pattern-id">شناسه پترن</Label>
              <Input id="pattern-id" dir="ltr" value={patternId} onChange={(e) => setPatternId(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pattern-params">پارامترها (key=value هر خط)</Label>
              <Textarea
                id="pattern-params"
                dir="ltr"
                className="min-h-24 font-mono text-sm"
                value={patternParams}
                onChange={(e) => setPatternParams(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pattern-to">گیرنده(ها)</Label>
              <Input
                id="pattern-to"
                dir="ltr"
                className="font-mono"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
              />
            </div>
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const recipients = sendTo.split(/[,،\s]+/).filter(Boolean);
                const params: Record<string, string> = {};
                for (const line of patternParams.split("\n")) {
                  const i = line.indexOf("=");
                  if (i > 0) params[line.slice(0, i).trim()] = line.slice(i + 1).trim();
                }
                const result = await sendSmsPanelPattern({ pattern: patternId, params, recipients });
                setBusy(false);
                setSendMsg(
                  result.ok
                    ? result.dryRun
                      ? result.message || "آزمایشی — ارسال واقعی نشد"
                      : "پترن ارسال شد"
                    : result.error || "ناموفق",
                );
              }}
            >
              ارسال پترن
            </Button>
            {sendMsg ? <p className="text-sm text-muted-foreground">{sendMsg}</p> : null}
          </TabsContent>

          <TabsContent value="inbox" className="space-y-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await fetchSmsPanelInbox();
                setBusy(false);
                setInbox(result.messages);
                setInboxNote(result.message || (result.stub ? "اسکلت/کش محلی" : null));
              }}
            >
              بروزرسانی صندوق
            </Button>
            {inboxNote ? <p className="text-xs text-muted-foreground">{inboxNote}</p> : null}
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full min-w-[28rem] text-sm">
                <thead className="bg-emerald-50/90 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-50">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">فرستنده</th>
                    <th className="px-3 py-2 text-start font-medium">متن</th>
                    <th className="px-3 py-2 text-start font-medium">زمان</th>
                    <th className="px-3 py-2 text-start font-medium">پاسخ</th>
                  </tr>
                </thead>
                <tbody>
                  {inbox.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                        پیامی نیست
                      </td>
                    </tr>
                  ) : (
                    inbox.map((m) => (
                      <tr key={m.id || `${m.from}-${m.at}`} className="border-t border-border/40">
                        <td className="px-3 py-2 font-mono text-xs" dir="ltr">
                          {m.from}
                        </td>
                        <td className="px-3 py-2">{m.body}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground" dir="ltr">
                          {m.at}
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReplyTo(m.from);
                              setReplyBody("");
                            }}
                          >
                            پاسخ
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {replyTo ? (
              <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-50/50 p-3 dark:bg-amber-950/20">
                <p className="text-sm">
                  پاسخ به <span className="font-mono" dir="ltr">{replyTo}</span>
                </p>
                <Textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} />
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const result = await replySmsPanel({ to: replyTo, text: replyBody });
                    setBusy(false);
                    setReplyMsg(
                      result.ok
                        ? result.dryRun
                          ? result.message || "آزمایشی"
                          : "پاسخ ارسال شد"
                        : result.error || "ناموفق",
                    );
                  }}
                >
                  ارسال پاسخ
                </Button>
                {replyMsg ? <p className="text-xs text-muted-foreground">{replyMsg}</p> : null}
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </SectionCard>
    </AppShell>
  );
}
