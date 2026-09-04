import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, FileText, MessageCircle, Phone, StickyNote, UserPlus, Users2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/states";
import { useStore } from "@/lib/store";
import { formatDate, formatNumber, toFa } from "@/lib/format";
import {
  ACTIVITY_LABEL,
  LOST_STAGE,
  PIPELINE_STAGES,
  type ActivityKind,
  type Opportunity,
} from "@/lib/types";
import { STAGE_TONE } from "./pipeline-utils";

const KIND_ICON: Record<ActivityKind, typeof Phone> = {
  call: Phone,
  meeting: Users2,
  sms: MessageCircle,
  whatsapp: MessageCircle,
  note: StickyNote,
};

export function DealDrawer({ deal, onClose }: { deal: Opportunity | null; onClose: () => void }) {
  const {
    dealActivities,
    customers,
    can,
    addDealActivity,
    moveOpportunity,
    convertOpportunity,
    createPolicyFromOpportunity,
    upsertOpportunity,
  } = useStore();
  const [kind, setKind] = useState<ActivityKind>("call");
  const [body, setBody] = useState("");
  const editable = can("pipeline.edit");

  const timeline = useMemo(
    () =>
      dealActivities
        .filter((a) => a.opportunityId === deal?.id)
        .sort((a, b) => +new Date(b.at) - +new Date(a.at)),
    [dealActivities, deal?.id],
  );

  const linked = customers.find((c) => c.id === deal?.customerId);
  const selectClass = "h-9 rounded-md border border-input bg-card px-3 text-sm";

  return (
    <Sheet open={!!deal} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-xl" dir="rtl">
        {deal && (
          <div className="space-y-5">
            <SheetHeader className="space-y-1 text-start">
              <SheetTitle className="text-base">{deal.title}</SheetTitle>
              <SheetDescription>
                {deal.contactName} — {deal.city} — منبع {deal.source}
              </SheetDescription>
            </SheetHeader>

            <ol className="flex flex-wrap gap-1" aria-label="مراحل قیف فروش">
              {PIPELINE_STAGES.map((s) => {
                const active = s === deal.stage;
                return (
                  <li key={s}>
                    <button
                      type="button"
                      disabled={!editable}
                      onClick={() => moveOpportunity(deal.id, s)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                        active ? STAGE_TONE[s] : "border-border text-muted-foreground hover:bg-secondary/60"
                      }`}
                      aria-current={active ? "step" : undefined}
                    >
                      {s}
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() => {
                    const reason = window.prompt("دلیل از دست رفتن فرصت؟", deal.lostReason ?? "");
                    if (reason !== null) moveOpportunity(deal.id, LOST_STAGE, reason || "نامشخص");
                  }}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-60 ${
                    deal.stage === LOST_STAGE ? STAGE_TONE[LOST_STAGE] : "border-border text-muted-foreground"
                  }`}
                >
                  از دست رفته
                </button>
              </li>
            </ol>

            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border/60 p-3 text-sm">
              <div>
                <dt className="text-[11px] text-muted-foreground">حق بیمه برآوردی</dt>
                <dd className="num font-semibold">{formatNumber(deal.expectedPremium)} ریال</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">احتمال موفقیت</dt>
                <dd className="num font-semibold">٪{toFa(deal.probability)}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">رشته بیمه</dt>
                <dd>{deal.product}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">شرکت بیمه‌گر</dt>
                <dd>{deal.company ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">کارشناس</dt>
                <dd>{deal.owner}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">شماره تماس</dt>
                <dd className="num">{toFa(deal.phone)}</dd>
              </div>
              {deal.lostReason && (
                <div className="col-span-2">
                  <dt className="text-[11px] text-muted-foreground">دلیل از دست رفتن</dt>
                  <dd className="text-destructive">{deal.lostReason}</dd>
                </div>
              )}
            </dl>

            <div className="rounded-xl border border-border/60 p-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold">
                <CalendarClock className="size-4 text-info" aria-hidden />
                اقدام بعدی — {formatDate(deal.nextActionAt)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-[200px] flex-1"
                  defaultValue={deal.nextAction}
                  disabled={!editable}
                  aria-label="اقدام بعدی"
                  onBlur={(e) =>
                    e.target.value !== deal.nextAction &&
                    upsertOpportunity({ ...deal, nextAction: e.target.value })
                  }
                />
                <input
                  type="date"
                  className={selectClass}
                  disabled={!editable}
                  aria-label="تاریخ اقدام بعدی"
                  defaultValue={deal.nextActionAt.slice(0, 10)}
                  onChange={(e) =>
                    e.target.value &&
                    upsertOpportunity({ ...deal, nextActionAt: new Date(e.target.value).toISOString() })
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {linked ? (
                <Link
                  to="/customers/$id"
                  params={{ id: linked.id }}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold"
                >
                  مشاهده پرونده {linked.fullName}
                </Link>
              ) : (
                <Button size="sm" disabled={!editable} onClick={() => convertOpportunity(deal.id)}>
                  <UserPlus className="size-4" aria-hidden />
                  تبدیل به بیمه‌گذار
                </Button>
              )}
              {deal.stage === "صدور" && deal.customerId && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!editable}
                  onClick={() => createPolicyFromOpportunity(deal.id)}
                >
                  <FileText className="size-4" aria-hidden />
                  ایجاد بیمه‌نامه پیش‌نویس
                </Button>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold">تاریخچه فعالیت‌ها</h3>
              {editable && (
                <form
                  className="space-y-2 rounded-xl border border-border/60 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!body.trim()) return;
                    addDealActivity(deal.id, kind, body.trim());
                    setBody("");
                  }}
                >
                  <div className="flex flex-wrap gap-2">
                    <select
                      className={selectClass}
                      value={kind}
                      onChange={(e) => setKind(e.target.value as ActivityKind)}
                      aria-label="نوع فعالیت"
                    >
                      {(Object.keys(ACTIVITY_LABEL) as ActivityKind[]).map((k) => (
                        <option key={k} value={k}>
                          {ACTIVITY_LABEL[k]}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" size="sm" className="ms-auto">
                      ثبت فعالیت
                    </Button>
                  </div>
                  <Textarea
                    rows={2}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="شرح تماس، جلسه یا یادداشت…"
                    aria-label="شرح فعالیت"
                  />
                </form>
              )}
              {timeline.length === 0 ? (
                <EmptyState title="هنوز فعالیتی ثبت نشده است" />
              ) : (
                <ul className="space-y-2">
                  {timeline.map((a) => {
                    const Icon = KIND_ICON[a.kind];
                    return (
                      <li key={a.id} className="flex gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
                        <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground">
                            {ACTIVITY_LABEL[a.kind]} — {a.by} — {formatDate(a.at)}
                          </p>
                          <p>{a.body}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
