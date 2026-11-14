import { useEffect, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { normalizeMobile } from "@/lib/phone";
import { sendSmsPanelPattern, sendSmsPanelText } from "@/lib/sms-panel";

export type SmsComposeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill recipient (customer / record mobile). Editable. */
  mobile?: string | null;
  /** Optional Persian context label (نام بیمه‌گذار و …). */
  contextLabel?: string;
};

function parseRecipients(raw: string): string[] {
  return raw
    .split(/[,،\s]+/)
    .map((s) => normalizeMobile(s) || s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function parseParams(raw: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) params[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return params;
}

/** Shared RTL compose: free text OR pattern → `/api/sms-panel/send` | send-pattern. */
export function SmsComposeDialog({
  open,
  onOpenChange,
  mobile,
  contextLabel,
}: SmsComposeDialogProps) {
  const prefill = normalizeMobile(mobile) || (mobile ?? "").trim();
  const [to, setTo] = useState(prefill);
  const [text, setText] = useState("");
  const [patternId, setPatternId] = useState("");
  const [patternParams, setPatternParams] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [resultOk, setResultOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    setTo(normalizeMobile(mobile) || (mobile ?? "").trim());
    setText("");
    setPatternId("");
    setPatternParams("");
    setResultMsg(null);
    setResultOk(null);
  }, [open, mobile]);

  const finish = (ok: boolean, message: string) => {
    setResultOk(ok);
    setResultMsg(message);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-4 text-emerald-700" />
            ارسال پیامک
          </DialogTitle>
          <DialogDescription>
            {contextLabel
              ? `گیرنده از پرونده: ${contextLabel}`
              : "متن آزاد یا پترن ثبت‌شده — از پنل ایران پیامک"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor="sms-compose-to">شماره موبایل</Label>
          <Input
            id="sms-compose-to"
            dir="ltr"
            className="font-mono"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="09xxxxxxxxx"
          />
        </div>

        <Tabs defaultValue="text" className="mt-2">
          <TabsList className="mb-2 w-full justify-start">
            <TabsTrigger value="text">متن آزاد</TabsTrigger>
            <TabsTrigger value="pattern">پترن</TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="sms-compose-body">متن پیامک</Label>
              <Textarea
                id="sms-compose-body"
                className="min-h-28"
                maxLength={900}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="متن آزاد…"
              />
            </div>
            <Button
              type="button"
              disabled={busy || !text.trim() || !to.trim()}
              onClick={async () => {
                setBusy(true);
                setResultMsg(null);
                const recipients = parseRecipients(to);
                const result = await sendSmsPanelText({ text: text.trim(), recipients });
                setBusy(false);
                if (result.ok) {
                  finish(
                    true,
                    result.dryRun
                      ? result.message || "آزمایشی — پیامک واقعی ارسال نشد"
                      : "پیامک با موفقیت ارسال شد",
                  );
                  if (!result.dryRun) setText("");
                } else {
                  finish(false, result.error || "ارسال ناموفق بود");
                }
              }}
            >
              <Send className="size-4" />
              ارسال
            </Button>
          </TabsContent>

          <TabsContent value="pattern" className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="sms-compose-pattern">شناسه پترن</Label>
              <Input
                id="sms-compose-pattern"
                dir="ltr"
                value={patternId}
                onChange={(e) => setPatternId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sms-compose-params">پارامترها (key=value هر خط)</Label>
              <Textarea
                id="sms-compose-params"
                dir="ltr"
                className="min-h-20 font-mono text-sm"
                value={patternParams}
                onChange={(e) => setPatternParams(e.target.value)}
              />
            </div>
            <Button
              type="button"
              disabled={busy || !patternId.trim() || !to.trim()}
              onClick={async () => {
                setBusy(true);
                setResultMsg(null);
                const recipients = parseRecipients(to);
                const result = await sendSmsPanelPattern({
                  pattern: patternId.trim(),
                  params: parseParams(patternParams),
                  recipients,
                });
                setBusy(false);
                if (result.ok) {
                  finish(
                    true,
                    result.dryRun
                      ? result.message || "آزمایشی — پترن واقعی ارسال نشد"
                      : "پترن با موفقیت ارسال شد",
                  );
                } else {
                  finish(false, result.error || "ارسال پترن ناموفق بود");
                }
              }}
            >
              <Send className="size-4" />
              ارسال پترن
            </Button>
          </TabsContent>
        </Tabs>

        {resultMsg ? (
          <p
            className={
              resultOk
                ? "text-sm font-medium text-emerald-700 dark:text-emerald-300"
                : "text-sm font-medium text-red-700 dark:text-red-300"
            }
            role="status"
          >
            {resultMsg}
          </p>
        ) : null}

        <DialogFooter className="sm:justify-start">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            بستن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
