import { useState } from "react";
import { MessageSquare, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmsComposeDialog } from "@/components/sms-compose-dialog";
import { cn } from "@/lib/utils";

export type RecordActionsProps = {
  /** Prefill SMS recipient from customer/record mobile. */
  mobile?: string | null;
  /** Persian label for compose dialog context. */
  contextLabel?: string;
  /** When provided, shows «ثبت» and calls this (existing save/update / form submit). */
  onSave?: () => void | Promise<void>;
  saveLabel?: string;
  smsLabel?: string;
  saveDisabled?: boolean;
  smsDisabled?: boolean;
  busy?: boolean;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  /** Hide «ثبت» even if onSave exists (rare). */
  hideSave?: boolean;
  /** Hide «پیامک». */
  hideSms?: boolean;
};

/**
 * Site-wide record actions: «ثبت» (optional) + «پیامک» → shared SmsComposeDialog.
 * Save only when an existing edit/save path is passed — never invents deletes.
 */
export function RecordActions({
  mobile,
  contextLabel,
  onSave,
  saveLabel = "ثبت",
  smsLabel = "پیامک",
  saveDisabled,
  smsDisabled,
  busy,
  className,
  size = "sm",
  hideSave,
  hideSms,
}: RecordActionsProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const showSave = Boolean(onSave) && !hideSave;
  const showSms = !hideSms;

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {showSave ? (
        <Button
          type="button"
          size={size}
          disabled={saveDisabled || busy || saving}
          onClick={async () => {
            if (!onSave) return;
            setSaving(true);
            try {
              await onSave();
            } finally {
              setSaving(false);
            }
          }}
        >
          <Save className="size-3.5" />
          {saveLabel}
        </Button>
      ) : null}
      {showSms ? (
        <Button
          type="button"
          size={size}
          variant="outline"
          disabled={smsDisabled || busy || saving}
          onClick={() => setOpen(true)}
        >
          <MessageSquare className="size-3.5" />
          {smsLabel}
        </Button>
      ) : null}
      {showSms ? (
        <SmsComposeDialog
          open={open}
          onOpenChange={setOpen}
          mobile={mobile}
          contextLabel={contextLabel}
        />
      ) : null}
    </div>
  );
}
