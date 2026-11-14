import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell, SectionCard } from "@/components/app-shell";
import { CustomerNameLink, PolicyDossierLink } from "@/components/customer-name-link";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { PolicyBadge } from "@/components/status-badge";
import { useStore } from "@/lib/store";
import { apiDataErrorMessage, fetchRenewals, SLIM_FEED_LIMIT } from "@/lib/api";
import { BRAND, LUX_ART } from "@/lib/brand";
import { LuxOrnament } from "@/components/lux-still";
import { RecordActions } from "@/components/record-actions";
import { Button } from "@/components/ui/button";
import { crmPageSubtitle } from "@/lib/crm-source";
import {
  RENEWAL_WINDOW_DAYS,
  mapRenewalPolicy,
  renewalRows,
  type FeedPolicy,
} from "@/lib/due-lists";
import { emptyDash, formatDate, formatNumber, toFa } from "@/lib/format";
import { afterPersistSuccess, fetchPersistMeta, postMarkRenewed } from "@/lib/persist-api";

export const Route = createFileRoute("/renewals")({
  head: () => ({
    meta: [
      { title: `تمدید | ${BRAND.title}` },
      { name: "description", content: "کارتابل تمدید بیمه‌نامه نمایندگی ۳۰۴۵." },
    ],
  }),
  component: RenewalsPage,
});

function RenewalsPage() {
  const { policies, customers, today, crmSource, crmError, retryCrmData, currentUser, can } =
    useStore();
  const [slim, setSlim] = useState<FeedPolicy[]>([]);
  const [slimState, setSlimState] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [slimError, setSlimError] = useState<string | null>(null);
  const [persistLive, setPersistLive] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  const canEdit = can("policies.edit");

  const loadSlim = useCallback(async () => {
    setSlimState("pending");
    setSlimError(null);
    try {
      const res = await fetchRenewals(RENEWAL_WINDOW_DAYS, SLIM_FEED_LIMIT);
      setSlim(res.data.policies.map(mapRenewalPolicy));
      setSlimState("done");
    } catch (err) {
      setSlimError(apiDataErrorMessage(err, "/api/renewals"));
      setSlimState("error");
    }
  }, []);

  useEffect(() => {
    if (slimState === "idle" && crmSource !== "mock") void loadSlim();
  }, [slimState, crmSource, loadSlim]);

  useEffect(() => {
    let cancelled = false;
    void fetchPersistMeta().then((res) => {
      if (cancelled) return;
      const eps = (res && "ok" in res && res.ok && Array.isArray(res.endpoints) ? res.endpoints : []) as string[];
      const live = eps.some((e) => e.includes("/api/renewals/mark") || e.includes("renewed"));
      setPersistLive(live);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const usingSlim = slimState === "done";
  const rows = useMemo(() => {
    const all = renewalRows({
      policies: usingSlim ? slim : policies,
      customers,
      today,
      withinDays: RENEWAL_WINDOW_DAYS,
      limit: usingSlim ? Math.max(slim.length, SLIM_FEED_LIMIT) : undefined,
      trustApiWindow: usingSlim,
    });
    return all.filter((r) => !hiddenIds.has(r.id));
  }, [usingSlim, policies, slim, customers, today, hiddenIds]);

  const retry = () => {
    void loadSlim();
    retryCrmData();
  };

  const sourceCount = usingSlim ? slim.length : policies.length > 0 ? policies.length : slim.length;
  const waiting =
    sourceCount === 0 && (slimState === "pending" || slimState === "idle" || crmSource === "pending");
  const failed =
    sourceCount === 0 && slimState === "error" && (crmSource === "error" || crmSource === "live");

  const markRenewed = async (row: (typeof rows)[number]) => {
    if (!canEdit || busyId) return;
    setBusyId(row.id);
    try {
      const res = await postMarkRenewed({
        policyId: row.id,
        performedBy: currentUser?.name,
      });
      if (res && "ok" in res && res.ok) {
        afterPersistSuccess();
        setHiddenIds((prev) => new Set(prev).add(row.id));
        toast.success(res.alreadyRenewed ? "قبلاً به‌عنوان تمدیدشده ثبت شده" : "تمدید ثبت شد (persist)");
      } else {
        // Optimistic local hide + clear stub label when API missing
        setHiddenIds((prev) => new Set(prev).add(row.id));
        toast.message(
          (res && "error" in res && res.error) ||
            "تمدید محلی — API persist در دسترس نیست (stub/local)",
        );
      }
    } catch {
      setHiddenIds((prev) => new Set(prev).add(row.id));
      toast.message("تمدید محلی — API persist در دسترس نیست (stub/local)");
    } finally {
      setBusyId(null);
    }
  };

  const persistHint =
    persistLive === null
      ? ""
      : persistLive
        ? " — ثبت «تمدید شد» روی API زنده"
        : " — برچسب stub: persist تمدید در دسترس نیست";

  return (
    <AppShell
      title="تمدید"
      subtitle={`${crmPageSubtitle(crmSource)} — ۴۵ روز آینده`}
      permission="policies.view"
    >
      <SectionCard
        title="نزدیک انقضا"
        description={`${toFa(rows.length)} مورد در این نما${persistHint}`}
      >
        <div className="relative overflow-hidden rounded-2xl">
          <LuxOrnament src={LUX_ART.dashboard} className="opacity-[0.14]" />
          <div className="relative z-[1]">
            {waiting ? (
              <TableSkeleton rows={8} cols={5} />
            ) : failed ? (
              <ErrorState
                message={slimError || crmError || "خواندن /api/renewals ناموفق بود."}
                onRetry={retry}
              />
            ) : rows.length === 0 ? (
              <EmptyState title="بیمه‌نامه‌ای در ۴۵ روز آینده سررسید نمی‌شود" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-base">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="p-2 text-start">بیمه‌گذار</th>
                      <th className="p-2 text-start">شماره</th>
                      <th className="p-2 text-start">رشته</th>
                      <th className="p-2 text-start">حق‌بیمه</th>
                      <th className="p-2 text-start">پایان پوشش</th>
                      <th className="p-2 text-start">باقی‌مانده</th>
                      <th className="p-2 text-start">وضعیت</th>
                      <th className="p-2 text-start">اقدام</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id} className="border-b border-border/50">
                        <td className="p-2">
                          <CustomerNameLink customerId={p.customerId} name={p.customerName} />
                        </td>
                        <td className="p-2">
                          <PolicyDossierLink
                            customerId={p.customerId}
                            label={p.policyLabel}
                            policyId={p.id}
                          />
                        </td>
                        <td className="p-2">{emptyDash(p.kind)}</td>
                        <td className="num p-2">{formatNumber(p.premium)}</td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {formatDate(p.endDate)}
                        </td>
                        <td className="num p-2">
                          {Number.isFinite(p.daysLeft) ? `${toFa(p.daysLeft)} روز` : "—"}
                        </td>
                        <td className="p-2">
                          <PolicyBadge status={p.status} />
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {canEdit ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busyId === p.id}
                                onClick={() => void markRenewed(p)}
                                title={
                                  persistLive
                                    ? "ثبت تمدید روی API"
                                    : "ثبت محلی — API persist در دسترس نیست"
                                }
                              >
                                تمدید شد
                                {persistLive === false ? (
                                  <span className="ms-1 text-[10px] text-muted-foreground">(stub)</span>
                                ) : null}
                              </Button>
                            ) : null}
                            <RecordActions
                              mobile={customers.find((c) => c.id === p.customerId)?.phone}
                              contextLabel={p.customerName || p.policyLabel}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </AppShell>
  );
}
