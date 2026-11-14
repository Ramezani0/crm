import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { PolicyDossierLink } from "@/components/customer-name-link";
import { DossierSmsPanel } from "@/components/dossier-sms";
import { CustomerDocumentsPanel } from "@/components/customer-documents";
import { RecordActions } from "@/components/record-actions";
import { PremiumAdjustmentCalc } from "@/components/premium-adjustment-calc";
import { LegalEntityIdField } from "@/components/legal-entity-id-field";
import { ProfileBadge3d } from "@/components/light-3d/profile-badge";
import { EmptyState, ErrorState } from "@/components/states";
import { CustomerBadge, InstallmentBadge, PolicyBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { apiDataErrorMessage, fetchCustomerDossier } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { crmPageSubtitle } from "@/lib/crm-source";
import {
  RENEWAL_BUCKET_LABEL,
  bucketPolicies,
  debtCaption,
  dossierHolderCodes,
  findCustomerByParam,
  overdueDays,
  partitionInstallments,
  policyDisplayNumber,
  relatedInstallments,
  relatedPolicies,
  remainingAmount,
  summarizeDebt,
  upsertById,
} from "@/lib/dossier";
import { extrasEntries, importFieldLabel } from "@/lib/import-fields";
import { displayHolderCode, emptyDash, formatDate, formatNumber, relativeDays, toFa } from "@/lib/format";
import { fillPolicyHolderCodes, mapCustomer, mapInstallment, mapPolicy } from "@/lib/map-api-data";
import {
  afterPersistSuccess,
  patchCustomer,
  resolvePolicyholderCode,
} from "@/lib/persist-api";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Customer, Installment, Policy } from "@/lib/types";

function DossierError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell title="پرونده ۳۶۵" subtitle="خطا در نمایش پرونده">
      <ErrorState message={error.message || "پرونده بارگذاری نشد."} onRetry={reset} />
    </AppShell>
  );
}

export const Route = createFileRoute("/customers/$customerId")({
  head: ({ params }) => ({
    meta: [
      { title: `پرونده ۳۶۵ | ${params.customerId} | ${BRAND.title}` },
      { name: "description", content: "پرونده کامل بیمه‌گذار — مشخصات، بیمه‌نامه‌ها، اقساط و مانده." },
    ],
  }),
  component: DossierPage,
  errorComponent: DossierError,
});

function Detail({
  label,
  value,
  numeric,
}: {
  label: string;
  value?: string;
  numeric?: boolean;
}) {
  const text = emptyDash(value);
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={numeric ? "num mt-0.5 text-sm" : "mt-0.5 text-sm"}>
        {numeric && text !== "—" ? toFa(text) : text}
      </dd>
    </div>
  );
}

function ExtraGrid({ extras }: { extras?: Record<string, string> }) {
  const entries = extrasEntries(extras);
  if (entries.length === 0) return null;
  return (
    <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {entries.map(([key, value]) => (
        <Detail key={key} label={importFieldLabel(key)} value={value} />
      ))}
    </dl>
  );
}

function DossierPage() {
  const { customerId: rawId } = Route.useParams();
  const hash = useRouterState({ select: (s) => s.location.hash });
  const {
    customers,
    policies,
    installments,
    crmSource,
    crmError,
    retryCrmData,
    mergeDossierSnapshot,
    currentUser,
    today,
  } = useStore();

  const paramId = useMemo(() => {
    try {
      return decodeURIComponent(rawId).trim();
    } catch {
      return rawId.trim();
    }
  }, [rawId]);

  const [localCustomer, setLocalCustomer] = useState<Customer | null>(null);
  const [localPolicies, setLocalPolicies] = useState<Policy[]>([]);
  const [localInstallments, setLocalInstallments] = useState<Installment[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [relatedPending, setRelatedPending] = useState(true);

  const customer =
    findCustomerByParam(customers, paramId) ??
    (localCustomer ? findCustomerByParam([localCustomer], paramId) : undefined) ??
    null;

  const loadDossier = useCallback(async () => {
    setLocalError(null);
    setRelatedPending(true);
    try {
      const res = await fetchCustomerDossier(paramId);
      const asOf = new Date();
      const mappedCustomer = mapCustomer(res.data.customer, 0);
      const mappedInstallments = (res.data.installments ?? []).map((row, i) =>
        mapInstallment(row, i, asOf),
      );
      const mappedPolicies = fillPolicyHolderCodes(
        (res.data.policies ?? []).map(mapPolicy),
        mappedInstallments,
        [mappedCustomer],
      );
      setLocalCustomer(mappedCustomer);
      setLocalPolicies(mappedPolicies);
      setLocalInstallments(mappedInstallments);
      mergeDossierSnapshot({
        customers: [mappedCustomer],
        policies: mappedPolicies,
        installments: mappedInstallments,
      });
      setRelatedPending(false);
    } catch (err) {
      setRelatedPending(false);
      setLocalError(apiDataErrorMessage(err, "/api/customers"));
    }
  }, [paramId, mergeDossierSnapshot]);

  useEffect(() => {
    void loadDossier();
  }, [loadDossier]);

  const retry = () => {
    void loadDossier();
    retryCrmData();
  };

  const customerInstallments = useMemo(() => {
    // Path A UI: once dossier GET is mapped, use ONLY those rows for debt KPI +
    // «مانده‌ها/معوق». Merging /api/data store rows re-introduced followup×unpaid
    // doubles (live 1838500 → 628M/8) when store lacked id-kind inference / policy keys.
    if (localInstallments.length > 0) {
      return localInstallments;
    }
    const fromStorePolicies = relatedPolicies(policies, paramId, customer);
    const mergedPolicies = upsertById(fromStorePolicies, localPolicies);
    const ids = new Set(mergedPolicies.map((p) => p.id));
    return relatedInstallments(installments, paramId, ids, customer);
  }, [installments, paramId, customer, policies, localPolicies, localInstallments]);

  const customerPolicies = useMemo(() => {
    const fromStore = relatedPolicies(policies, paramId, customer);
    return fillPolicyHolderCodes(
      upsertById(fromStore, localPolicies),
      customerInstallments,
      customer ? [customer] : [],
    );
  }, [policies, paramId, customer, localPolicies, customerInstallments]);

  const debt = useMemo(() => summarizeDebt(customerInstallments), [customerInstallments]);
  const renewals = useMemo(
    () => bucketPolicies(customerPolicies, today),
    [customerPolicies, today],
  );
  const holderCode = dossierHolderCodes(customerPolicies, customerInstallments);

  useEffect(() => {
    const id = hash.replace(/^#/, "");
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [hash, customerPolicies, customerInstallments]);

  const waiting = !customer && relatedPending && !localError;
  const failed = !customer && !relatedPending && Boolean(localError || crmSource === "error");

  return (
    <AppShell
      title="پرونده ۳۶۵"
      subtitle={
        customer
          ? customer.fullName
          : relatedPending
            ? "در حال گشودن پرونده…"
            : crmPageSubtitle(crmSource)
      }
      holderCode={holderCode || undefined}
      permission="customers.view"
      leading={customer ? <ProfileBadge3d name={customer.fullName} compact /> : undefined}
      actions={
        <div className="flex flex-wrap gap-2">
          {customer ? (
            <RecordActions
              mobile={customer.phone}
              contextLabel={customer.fullName}
              size="sm"
              hideSave
            />
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            تلاش دوباره
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/customers">بازگشت به فهرست</Link>
          </Button>
        </div>
      }
    >
      {customer ? (
        <>
          <CustomerSection
            customer={customer}
            onSaved={(next) => {
              setLocalCustomer(next);
              mergeDossierSnapshot({ customers: [next], policies: [], installments: [] });
            }}
            performedBy={currentUser?.name}
          />
          <SectionCard
            title="آرشیو اسناد"
            description="مدارک پرونده — آپلود روی سرور، حذف نرم"
          >
            <CustomerDocumentsPanel customer={customer} uploadedBy={currentUser?.name} />
          </SectionCard>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="glass rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">مانده معوق</p>
              <p className="num mt-2 text-xl font-extrabold text-title">
                {formatNumber(debt.overdueBalance)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {toFa(debt.overdueCount)} قسط معوق
              </p>
            </div>
            <div className="glass rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">مانده پرداخت‌نشده</p>
              <p className="num mt-2 text-xl font-extrabold text-title">
                {formatNumber(debt.unpaidBalance)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {toFa(debt.unpaidCount)} قسط باز
                {debt.historyCount > 0
                  ? ` · ${toFa(debt.historyCount)} HIST خارج از بدهی`
                  : ""}
              </p>
            </div>
            <div className="glass rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">وصول ثبت‌شده</p>
              <p className="num mt-2 text-xl font-extrabold text-title">
                {formatNumber(debt.paidTotal)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{debtCaption(debt)}</p>
            </div>
          </div>

          {relatedPending && customerPolicies.length === 0 ? (
            <p className="text-sm text-muted-foreground">در حال خواندن بیمه‌نامه‌ها و اقساط این پرونده…</p>
          ) : null}

          <SectionCard title="تمدید" description="هر بیمه‌نامه پرونده در یکی از سه سطل پایان پوشش">
            <div className="grid gap-3 sm:grid-cols-3">
              <RenewalBucketCard
                title={RENEWAL_BUCKET_LABEL.missed}
                items={renewals.missed}
                today={today}
              />
              <RenewalBucketCard
                title={RENEWAL_BUCKET_LABEL.near}
                items={renewals.near}
                today={today}
              />
              <RenewalBucketCard
                title={RENEWAL_BUCKET_LABEL.far}
                items={renewals.far}
                today={today}
              />
            </div>
          </SectionCard>

          <PoliciesSection policies={customerPolicies} customerId={customer.id} />
          <PremiumAdjustmentCalc policies={customerPolicies} />
          <InstallmentsSection
            installments={customerInstallments}
            policies={customerPolicies}
            customerId={customer.id}
            today={today}
          />
          <SectionCard title="پیامک ایران پیامک" description="ارسال متن آزاد به شماره همین بیمه‌گذار">
            <DossierSmsPanel name={customer.fullName} phone={customer.phone} />
          </SectionCard>
        </>
      ) : failed ? (
        <ErrorState
          message={localError || crmError || "خواندن پرونده ناموفق بود."}
          onRetry={retry}
        />
      ) : waiting ? (
        <div className="space-y-3 rounded-xl border border-border px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">در حال گشودن پرونده… اگر طول کشید دوباره تلاش کنید.</p>
          <Button type="button" size="sm" onClick={retry}>
            تلاش دوباره
          </Button>
        </div>
      ) : (
        <EmptyState
          title="بیمه‌گذار در دادهٔ فعلی نیست"
          description="شناسه پرونده با فروشگاه همخوانی ندارد. از فهرست مشتریان وارد شوید."
          action={
            <Button asChild variant="outline">
              <Link to="/customers">فهرست مشتریان</Link>
            </Button>
          }
        />
      )}
    </AppShell>
  );
}

function CustomerSection({
  customer,
  onSaved,
  performedBy,
}: {
  customer: Customer;
  onSaved: (c: Customer) => void;
  performedBy?: string;
}) {
  const [fullName, setFullName] = useState(customer.fullName);
  const [phone, setPhone] = useState(customer.phone);
  const [note, setNote] = useState(customer.note ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const code = resolvePolicyholderCode(customer);

  useEffect(() => {
    setFullName(customer.fullName);
    setPhone(customer.phone);
    setNote(customer.note ?? "");
  }, [customer.id, customer.fullName, customer.phone, customer.note]);

  const onSave = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      if (!code) {
        setErr("کد بیمه‌گذار برای ثبت یافت نشد");
        return;
      }
      const res = await patchCustomer(code, {
        full_name: fullName.trim(),
        name: fullName.trim(),
        phone: phone.trim(),
        mobile: phone.trim(),
        note,
        performedBy,
      });
      if (!res.ok) {
        setErr(res.error || "ثبت تغییرات ناموفق بود");
        return;
      }
      const next: Customer = {
        ...customer,
        fullName: fullName.trim() || customer.fullName,
        phone: phone.trim(),
        note,
      };
      onSaved(next);
      afterPersistSuccess();
      setMsg(res.updated === false ? "بدون تغییر" : "ثبت شد — PATCH persist");
    } catch {
      setErr("خطا در ارتباط با سرور");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="edit-customer" className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-4">
        <ProfileBadge3d name={fullName || customer.fullName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold text-title">{fullName || customer.fullName}</h2>
              <CustomerBadge status={customer.status} label={customer.statusLabel} />
            </div>
            <RecordActions
              mobile={phone || customer.phone}
              contextLabel={fullName || customer.fullName}
              onSave={onSave}
              busy={busy}
              size="sm"
            />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            ویرایش نام، تلفن و یادداشت از طریق PATCH — کد بیمه‌گذار قفل است.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="dossier-fullname">نام کامل</Label>
              <Input id="dossier-fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dossier-phone">تلفن</Label>
              <Input id="dossier-phone" dir="ltr" className="font-mono" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>کد بیمه‌گذار</Label>
              <Input value={customer.holderCode || code} readOnly dir="ltr" className="font-mono bg-muted/40" />
            </div>
            <div className="space-y-1 sm:col-span-2 xl:col-span-4">
              <Label htmlFor="dossier-note">یادداشت</Label>
              <Textarea id="dossier-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" />
            </div>
          </div>
          {msg ? <p className="mt-2 text-sm text-emerald-700">{msg}</p> : null}
          {err ? <p className="mt-2 text-sm text-destructive">{err}</p> : null}
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Detail label="کد ملی" value={customer.nationalId} numeric />
            <LegalEntityIdField value={customer.legalEntityId} />
            <Detail label="ایمیل" value={customer.email} />
            <Detail label="شهر" value={customer.city} />
            <Detail label="نشانی" value={customer.address} />
            <Detail label="کد پستی" value={customer.postalCode} numeric />
            <Detail label="نام پدر" value={customer.fatherName} />
            <Detail label="تاریخ تولد" value={customer.birthDate} />
            <Detail label="بخش" value={customer.segment} />
            <Detail
              label="وضعیت"
              value={
                customer.statusLabel?.trim() ||
                (customer.status === "active" ? "فعال" : customer.status === "lead" ? "سرنخ" : "غیرفعال")
              }
            />
            <Detail label="کارشناس" value={customer.agent} />
            <Detail label="تاریخ ایجاد" value={formatDate(customer.createdAt)} />
          </dl>
          <ExtraGrid extras={customer.extras} />
        </div>
      </div>
    </section>
  );
}


function PoliciesSection({ policies, customerId }: { policies: Policy[]; customerId: string }) {
  return (
    <SectionCard title="بیمه‌نامه‌ها" description={`${toFa(policies.length)} بیمه‌نامه مرتبط — همه ستون‌های واردشده`}>
      {policies.length === 0 ? (
        <EmptyState title="بیمه‌نامه‌ای برای این پرونده نیست" />
      ) : (
        <div className="max-h-[36rem] overflow-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="sticky top-0 bg-card/95 p-2 text-start">شماره</th>
                <th className="sticky top-0 bg-card/95 p-2 text-start">کد رایانه</th>
                <th className="sticky top-0 bg-card/95 p-2 text-start">رشته</th>
                <th className="sticky top-0 bg-card/95 p-2 text-start">رشته خام</th>
                <th className="sticky top-0 bg-card/95 p-2 text-start">شرکت</th>
                <th className="sticky top-0 bg-card/95 p-2 text-start">حق‌بیمه</th>
                <th className="sticky top-0 bg-card/95 p-2 text-start">صدور</th>
                <th className="sticky top-0 bg-card/95 p-2 text-start">شروع</th>
                <th className="sticky top-0 bg-card/95 p-2 text-start">پایان</th>
                <th className="sticky top-0 bg-card/95 p-2 text-start">کد بیمه‌گذار</th>
                <th className="sticky top-0 bg-card/95 p-2 text-start">کد ملی بیمه‌گذار</th>
                <th className="sticky top-0 bg-card/95 p-2 text-start">وضعیت</th>
                <th className="sticky top-0 bg-card/95 p-2 text-start">اقدام</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id} id={`policy-${p.id}`} className="border-b border-border/50">
                  <td className="p-2">
                    <PolicyDossierLink
                      customerId={customerId}
                      label={policyDisplayNumber(p)}
                      policyId={p.id}
                    />
                  </td>
                  <td className="num p-2 text-xs">{emptyDash(p.computerCode)}</td>
                  <td className="p-2">{emptyDash(p.kind)}</td>
                  <td className="p-2 text-xs text-muted-foreground">{emptyDash(p.kindRaw)}</td>
                  <td className="p-2 text-xs text-muted-foreground">{emptyDash(p.company)}</td>
                  <td className="num p-2">{formatNumber(p.premium)}</td>
                  <td className="p-2 text-xs">{formatDate(p.issueDate ?? "")}</td>
                  <td className="p-2 text-xs">{formatDate(p.startDate)}</td>
                  <td className="p-2 text-xs">{formatDate(p.endDate)}</td>
                  <td className="num p-2 text-xs">{displayHolderCode(p.holderCode)}</td>
                  <td className="num p-2 text-xs">{emptyDash(p.holderNationalId)}</td>
                  <td className="p-2">
                    <PolicyBadge status={p.status} label={p.statusLabel} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {policies.map((p) =>
            extrasEntries(p.extras).length ? (
              <div key={`${p.id}-extras`} className="border-b border-border/40 px-2 py-2 text-xs">
                <p className="mb-1 text-muted-foreground">
                  سایر فیلدهای بیمه‌نامه {policyDisplayNumber(p)}
                </p>
                <ExtraGrid extras={p.extras} />
              </div>
            ) : null,
          )}
        </div>
      )}
    </SectionCard>
  );
}

function InstallmentsSection({
  installments,
  policies,
  customerId,
  today,
}: {
  installments: Installment[];
  policies: Policy[];
  customerId: string;
  today: Date;
}) {
  const policyOf = (id: string) => policies.find((p) => p.id === id);
  const parts = partitionInstallments(installments);
  const progressLabel =
    parts.totalOpenOrPaid === 0
      ? "قسط واقعی نیست"
      : `تا کجا پرداخت شده: ${toFa(parts.paidCount)} از ${toFa(parts.totalOpenOrPaid)}`;

  const renderRows = (rows: Installment[], showOverdueDays: boolean) => (
    <div className="max-h-[24rem] overflow-auto">
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="sticky top-0 bg-card/95 p-2 text-start">بیمه‌نامه</th>
            <th className="sticky top-0 bg-card/95 p-2 text-start">ردیف</th>
            <th className="sticky top-0 bg-card/95 p-2 text-start">مبلغ</th>
            <th className="sticky top-0 bg-card/95 p-2 text-start">مانده</th>
            <th className="sticky top-0 bg-card/95 p-2 text-start">پرداخت‌شده</th>
            <th className="sticky top-0 bg-card/95 p-2 text-start">تاریخ پرداخت</th>
            <th className="sticky top-0 bg-card/95 p-2 text-start">سررسید</th>
            {showOverdueDays ? (
              <th className="sticky top-0 bg-card/95 p-2 text-start">روز معوق</th>
            ) : null}
            <th className="sticky top-0 bg-card/95 p-2 text-start">وضعیت</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const policy = policyOf(i.policyId);
            const days = showOverdueDays ? overdueDays(i, today) : Number.NaN;
            return (
              <tr key={i.id} className="border-b border-border/50">
                <td className="p-2">
                  <PolicyDossierLink
                    customerId={customerId}
                    label={policy ? policyDisplayNumber(policy) : emptyDash(i.policyId)}
                    policyId={i.policyId}
                  />
                </td>
                <td className="num p-2">{toFa(i.seq)}</td>
                <td className="num p-2">{formatNumber(i.amount)}</td>
                <td className="num p-2">{formatNumber(remainingAmount(i))}</td>
                <td className="num p-2">{formatNumber(i.paidAmount)}</td>
                <td className="p-2 text-xs">
                  {formatDate(i.paidDate || i.payments[0]?.date || "")}
                </td>
                <td className="p-2 text-xs text-muted-foreground">{formatDate(i.dueDate)}</td>
                {showOverdueDays ? (
                  <td className="num p-2 text-xs">
                    {Number.isFinite(days) ? `${toFa(days)} روز` : "—"}
                  </td>
                ) : null}
                <td className="p-2">
                  <InstallmentBadge status={i.status} label={i.statusLabel} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <SectionCard
      title="اقساط و بدهی"
      description={`${toFa(installments.length)} ردیف · ${progressLabel}`}
    >
      {installments.length === 0 ? (
        <EmptyState title="قسطی برای این پرونده نیست" />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 p-3 text-sm">
            <p className="font-semibold text-title">پیشرفت وصول</p>
            <p className="mt-1 text-muted-foreground">{progressLabel}</p>
            {parts.lastPaid ? (
              <p className="mt-1 text-xs text-muted-foreground">
                آخرین قسط وصول‌شده: ردیف {toFa(parts.lastPaid.seq)} ·{" "}
                {formatNumber(parts.lastPaid.amount)} ·{" "}
                {formatDate(parts.lastPaid.paidDate || parts.lastPaid.payments[0]?.date || "")}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">هنوز قسط وصول‌شده‌ای ثبت نشده.</p>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-title">
              پرداخت‌شده‌ها ({toFa(parts.paid.length)})
            </p>
            {parts.paid.length === 0 ? (
              <p className="text-xs text-muted-foreground">موردی نیست</p>
            ) : (
              renderRows(parts.paid, false)
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-title">
              مانده‌ها / معوق ({toFa(parts.open.length + parts.overdue.length)})
            </p>
            {parts.open.length + parts.overdue.length === 0 ? (
              <p className="text-xs text-muted-foreground">قسط باز یا معوقی نیست</p>
            ) : (
              renderRows([...parts.overdue, ...parts.open], true)
            )}
          </div>

          {parts.history.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {toFa(parts.history.length)} ردیف HIST/تاریخچه در جمع معوق و مانده باز نیامده است.
            </p>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

function RenewalBucketCard({
  title,
  items,
  today,
}: {
  title: string;
  items: Policy[];
  today: Date;
}) {
  return (
    <div className="rounded-xl border border-border/60 p-3">
      <p className="font-semibold text-title">{title}</p>
      <p className="num mt-1 text-xs text-muted-foreground">{toFa(items.length)} بیمه‌نامه</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">موردی نیست</p>
      ) : (
        <ul className="mt-2 max-h-56 space-y-1 overflow-auto text-sm">
          {items.map((p) => {
            const days = relativeDays(p.endDate, today);
            return (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">
                  <PolicyDossierLink
                    customerId={p.customerId}
                    label={policyDisplayNumber(p)}
                    policyId={p.id}
                  />
                  <span className="ms-1 text-xs text-muted-foreground">{emptyDash(p.kind)}</span>
                </span>
                <span className="num shrink-0 text-xs text-muted-foreground">
                  {formatDate(p.endDate)}
                  {Number.isFinite(days) ? ` · ${toFa(days)}ر` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
