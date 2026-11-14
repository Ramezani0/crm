import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { emptyDash } from "@/lib/format";
import { normalizeMobile } from "@/lib/phone";
import {
  SMS_ENV_NEEDED,
  fetchSmsLog,
  fetchSmsStatus,
  sendSmsReminder,
  type SmsSendLogItem,
  type SmsStatus,
} from "@/lib/sms";

export function DossierSmsPanel({
  name,
  phone,
}: {
  name: string;
  phone?: string | null;
}) {
  const mobile = normalizeMobile(phone);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [log, setLog] = useState<SmsSendLogItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSmsStatus(), fetchSmsLog()]).then(([nextStatus, nextLog]) => {
      if (cancelled) return;
      setStatus(nextStatus);
      setLog(nextLog);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const validate = () => {
    const body = text.trim();
    if (!mobile) {
      setValidation("شماره موبایل معتبر نیست (باید ۱۱ رقم و با ۰۹ شروع شود).");
      return null;
    }
    if (!body) {
      setValidation("متن پیامک خالی است.");
      return null;
    }
    setValidation(null);
    return body.slice(0, 500);
  };

  const send = async (dryRun: boolean) => {
    const body = validate();
    if (!body || busy) return;
    setBusy(true);
    setLast(null);
    const result = await sendSmsReminder({
      kind: "free_text",
      text: body,
      recipients: [mobile],
      dryRun,
    });
    setBusy(false);
    if (result.ok) {
      setLast(result.dryRun || dryRun ? "آزمایش موفق — پیامک واقعی ارسال نشد" : "ارسال شد");
      if (!dryRun) setText("");
    } else {
      setLast(result.error || SMS_ENV_NEEDED);
    }
    const nextLog = await fetchSmsLog();
    setLog(nextLog);
    if (result.log) {
      setLog((prev) => [result.log!, ...prev.filter((item) => item !== result.log)].slice(0, 20));
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        پیامک آزاد به شماره مشتری از ایران پیامک. برای QA از «آزمایش ارسال» استفاده کنید — ارسال
        واقعی لازم نیست. رمز فقط روی سرور (`IRANPAYAMAK_*`) است.
      </p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">گیرنده</dt>
          <dd>{name}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">تلفن</dt>
          <dd className="num" dir="ltr">
            {emptyDash(mobile || phone)}
          </dd>
        </div>
      </dl>
      {!mobile && (
        <p className="text-sm text-warning">شماره موبایل معتبر برای ارسال در پرونده نیست.</p>
      )}
      {status && !status.configured && (
        <p className="text-sm font-semibold text-warning">
          {SMS_ENV_NEEDED} — آزمایش ارسال (dry-run) بدون env هم موفق می‌شود.
        </p>
      )}
      <div className="space-y-1">
        <Label htmlFor="dossier-sms">متن پیامک</Label>
        <Textarea
          id="dossier-sms"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setValidation(null);
          }}
          maxLength={500}
          rows={4}
          placeholder="متن آزاد پیامک…"
        />
        <p className="text-[11px] text-muted-foreground">{text.trim().length} / ۵۰۰</p>
      </div>
      {validation && <p className="text-sm text-warning">{validation}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void send(true)}>
          {busy ? "در حال آزمایش…" : "آزمایش ارسال (dry-run)"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!status?.configured || busy}
          onClick={() => void send(false)}
        >
          ارسال واقعی
        </Button>
      </div>
      {last && <p className="text-sm">{last}</p>}
      {log.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {log.slice(0, 5).map((item, index) => (
            <li key={`${item.at ?? index}-${item.ok}`}>
              {item.ok ? (item.code === "sms_dry_run" ? "آزمایش موفق" : "موفق") : "ناموفق"}
              {item.error ? ` — ${item.error}` : ""}
              {item.recipients?.[0] ? ` — ${item.recipients[0]}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
