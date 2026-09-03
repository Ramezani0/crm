import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { AppShell, SectionCard } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { formatDate, formatNumber, toFa } from "@/lib/format";
import { CustomerBadge, InstallmentBadge, PolicyBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states";

export const Route = createFileRoute("/customers/$id")({
  head: () => ({
    meta: [
      { title: "پرونده بیمه‌گذار | CRM فصیحی" },
      { name: "description", content: "پرونده کامل بیمه‌گذار شامل مشخصات، بیمه‌نامه‌ها، اقساط و سوابق پرداخت." },
      { property: "og:title", content: "پرونده بیمه‌گذار" },
      { property: "og:description", content: "مشاهده مشخصات، بیمه‌نامه‌ها و وضعیت مالی مشتری." },
    ],
  }),
  component: CustomerProfile,
});

function CustomerProfile() {
  const { id } = useParams({ from: "/customers/$id" });
  const { customers, policies, installments } = useStore();
  const customer = customers.find((c) => c.id === id);

  if (!customer) {
    return (
      <AppShell title="پرونده بیمه‌گذار" permission="customers.view">
        <EmptyState title="مشتری یافت نشد" description="ممکن است رکورد حذف شده باشد." />
      </AppShell>
    );
  }

  const myPolicies = policies.filter((p) => p.customerId === customer.id);
  const myInst = installments.filter((i) => i.customerId === customer.id);
  const debt = myInst.reduce((s, i) => s + (i.amount - i.paidAmount), 0);

  return (
    <AppShell title={customer.fullName} subtitle={`کد مشتری ${toFa(customer.id)}`} permission="customers.view">
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="مشخصات" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            {[
              ["کد ملی", toFa(customer.nationalId)],
              ["موبایل", toFa(customer.phone)],
              ["ایمیل", customer.email],
              ["شهر", customer.city],
              ["نوع", customer.segment],
              ["کارشناس", customer.agent],
              ["تاریخ ثبت", formatDate(customer.createdAt)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-border/40 pb-1.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between pt-1">
              <dt className="text-muted-foreground">وضعیت</dt>
              <dd>
                <CustomerBadge status={customer.status} statusLabel={customer.statusLabel} />
              </dd>
            </div>
          </dl>
          {customer.note && <p className="mt-3 rounded-lg bg-secondary/60 p-3 text-xs">{customer.note}</p>}
        </SectionCard>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="glass rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">بیمه‌نامه‌ها</p>
              <p className="mt-2 text-2xl font-extrabold">{toFa(myPolicies.length)}</p>
            </div>
            <div className="glass rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">اقساط</p>
              <p className="mt-2 text-2xl font-extrabold">{toFa(myInst.length)}</p>
            </div>
            <div className="glass rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">مانده بدهی (ریال)</p>
              <p className="mt-2 text-2xl font-extrabold">{formatNumber(debt)}</p>
            </div>
          </div>

          <SectionCard title="بیمه‌نامه‌ها">
            {myPolicies.length === 0 ? (
              <EmptyState title="بیمه‌نامه‌ای ثبت نشده است" />
            ) : (
              <ul className="space-y-2">
                {myPolicies.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <span className="font-semibold">{p.kind}</span>
                    <span className="num text-xs text-muted-foreground">{toFa(p.number)}</span>
                    <span className="text-xs text-muted-foreground">{p.company}</span>
                    <span className="num ms-auto text-xs">{formatNumber(p.premium)} ریال</span>
                    <PolicyBadge status={p.status} statusLabel={p.statusLabel} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="اقساط">
            <ul className="space-y-2">
              {myInst.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <span>قسط {toFa(i.seq)}</span>
                  <span className="text-xs text-muted-foreground">سررسید {formatDate(i.dueDate)}</span>
                  <span className="num ms-auto text-xs">{formatNumber(i.amount)}</span>
                  <InstallmentBadge status={i.status} statusLabel={i.statusLabel} />
                </li>
              ))}
            </ul>
            <Link to="/installments" className="mt-3 inline-block text-xs text-primary">
              مدیریت پرداخت‌ها
            </Link>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
