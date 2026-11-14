import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronLeft,
  Network,
  Plus,
  RefreshCw,
  UserPlus,
  Wallet,
} from "lucide-react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";
import { formatNumber, toFa } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  createSalesAgent,
  fetchCommissionRules,
  fetchSalesAgents,
  fetchSalesTree,
  previewCommissionApi,
  previewCommissionLocal,
  type CommissionPreview,
  type CommissionRule,
  type SalesAgent,
} from "@/lib/sales-network";

export const Route = createFileRoute("/sales-network")({
  head: () => ({
    meta: [
      { title: `شبکه فروش | ${BRAND.title}` },
      {
        name: "description",
        content: "درخت نمایندگان و پیش‌نمایش کارمزد چندسطحی — اسکلت M1.",
      },
    ],
  }),
  component: SalesNetworkPage,
});

const ROLE_OPTIONS: { id: string; label: string }[] = [
  { id: "general", label: "جنرال" },
  { id: "ayeen96", label: "آیین۹۶" },
  { id: "broker", label: "کارگزار" },
  { id: "development_manager", label: "مدیرتوسعه" },
  { id: "marketer", label: "بازاریاب" },
];

const FIELD =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Flat CSS KPI — no Three.js / no canvas / no KpiOrb. */
function FlatKpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="glass rounded-2xl border border-border/60 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-extrabold text-title">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function AgentTreeNode({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: SalesAgent;
  depth: number;
  selectedId: number | null;
  onSelect: (a: SalesAgent) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasKids = (node.children?.length ?? 0) > 0;
  const active = selectedId === node.id;

  return (
    <li className="list-none">
      <div
        className={cn(
          "flex items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 text-sm transition-colors",
          active ? "border-primary/40 bg-primary/10" : "hover:bg-muted/50",
        )}
        style={{ paddingInlineStart: `${depth * 1.1 + 0.25}rem` }}
      >
        {hasKids ? (
          <button
            type="button"
            className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted"
            aria-expanded={open}
            aria-label={open ? "بستن زیرشاخه" : "باز کردن زیرشاخه"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
          </button>
        ) : (
          <span className="size-6" aria-hidden />
        )}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-right"
          onClick={() => onSelect(node)}
        >
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              node.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {node.roleLabel}
          </span>
          <span className="truncate font-medium text-title">{node.fullName}</span>
          <span className="num ms-auto shrink-0 text-[11px] text-muted-foreground">{node.code}</span>
        </button>
      </div>
      {hasKids && open ? (
        <ul className="me-3 border-r border-border/50">
          {node.children!.map((c) => (
            <AgentTreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function SalesNetworkPage() {
  const [tree, setTree] = useState<SalesAgent[]>([]);
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [withholding, setWithholding] = useState(10);
  const [stats, setStats] = useState({
    totalAgents: 0,
    activeAgents: 0,
    inactiveAgents: 0,
    roots: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SalesAgent | null>(null);
  const [apiLive, setApiLive] = useState(false);

  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("marketer");
  const [formParent, setFormParent] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const [premium, setPremium] = useState("10000000");
  const [policyYear, setPolicyYear] = useState("1");
  const [previewAgentId, setPreviewAgentId] = useState("");
  const [preview, setPreview] = useState<CommissionPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [t, a, r] = await Promise.all([
      fetchSalesTree(),
      fetchSalesAgents(),
      fetchCommissionRules(),
    ]);
    if (t.ok && a.ok) {
      setApiLive(true);
      setTree(t.tree);
      setAgents(a.items);
      if (t.stats) {
        setStats({
          totalAgents: t.stats.totalAgents,
          activeAgents: t.stats.activeAgents,
          inactiveAgents: t.stats.inactiveAgents,
          roots: t.stats.roots,
        });
      }
      const pick =
        a.items.find((x) => x.role === "marketer") ?? a.items[a.items.length - 1] ?? null;
      setSelected((prev) => prev ?? pick);
      setPreviewAgentId((prev) => prev || (pick ? String(pick.id) : ""));
    } else {
      setApiLive(false);
      setError(t.error || a.error || "API شبکه فروش در دسترس نیست — حالت محلی.");
    }
    if (r.ok) {
      setRules(r.items);
      if (r.withholdingTaxPct != null) setWithholding(r.withholdingTaxPct);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const issuanceRules = useMemo(
    () => rules.filter((x) => x.kind === "issuance").sort((a, b) => a.policyYear - b.policyYear),
    [rules],
  );

  async function onCreateAgent(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);
    if (!apiLive) {
      setFormMsg("API آفلاین — ایجاد فقط روی سرور ممکن است.");
      return;
    }
    const res = await createSalesAgent({
      code: formCode.trim(),
      fullName: formName.trim(),
      role: formRole,
      parentId: formParent ? Number(formParent) : null,
      phone: formPhone.trim(),
    });
    if (!res.ok) {
      setFormMsg(res.error || "خطا در ایجاد");
      return;
    }
    setFormMsg("نماینده افزوده شد.");
    setFormCode("");
    setFormName("");
    setFormPhone("");
    await reload();
  }

  async function runPreview(e?: React.FormEvent) {
    e?.preventDefault();
    setPreviewBusy(true);
    const payload = {
      premiumRial: Number(String(premium).replace(/,/g, "")) || 0,
      policyYear: Number(policyYear) || 1,
      agentId: Number(previewAgentId) || 0,
    };
    let result: CommissionPreview;
    if (apiLive) {
      result = await previewCommissionApi(payload);
      if (!result.ok) {
        result = previewCommissionLocal({
          ...payload,
          agents,
          withholdingTaxPct: withholding,
        });
      }
    } else {
      result = previewCommissionLocal({
        ...payload,
        agents,
        withholdingTaxPct: withholding,
      });
    }
    setPreview(result);
    setPreviewBusy(false);
  }

  return (
    <AppShell
      title="شبکه فروش"
      subtitle="درخت نمایندگان و کارمزد چندسطحی — اسکلت M1"
      permission="tools.view"
      actions={
        <Button type="button" variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden />
          به‌روزرسانی
        </Button>
      }
    >
      {error ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FlatKpi label="کل نمایندگان" value={toFa(stats.totalAgents || agents.length)} hint="گره‌های درخت" />
        <FlatKpi label="فعال" value={toFa(stats.activeAgents)} hint="وضعیت فعال" />
        <FlatKpi label="ریشه" value={toFa(stats.roots || tree.length)} hint="بدون والد" />
        <FlatKpi label="مالیات تکلیفی (دمو)" value={`${toFa(withholding)}٪`} hint="DEMO_DEFAULTS — حقوقی نیست" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="درخت نمایندگان"
          description="جنرال ← آیین۹۶ ← کارگزار ← مدیرتوسعه ← بازاریاب"
          actions={
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Network className="size-3.5" aria-hidden />
              RTL
            </span>
          }
        >
          {loading && !tree.length ? (
            <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>
          ) : tree.length === 0 ? (
            <p className="text-sm text-muted-foreground">درختی یافت نشد.</p>
          ) : (
            <ul className="max-h-[28rem] space-y-0.5 overflow-y-auto" dir="rtl">
              {tree.map((n) => (
                <AgentTreeNode
                  key={n.id}
                  node={n}
                  depth={0}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelected}
                />
              ))}
            </ul>
          )}
          {selected ? (
            <div className="mt-3 rounded-xl border border-border/60 bg-card/50 p-3 text-sm">
              <p className="font-bold text-title">{selected.fullName}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selected.roleLabel} · کد <span className="num">{selected.code}</span>
                {selected.phone ? ` · ${selected.phone}` : ""}
              </p>
              {selected.notes ? <p className="mt-1 text-xs">{selected.notes}</p> : null}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="افزودن نماینده" description="فرم پایه — بدون ایمپورت اکسل">
          <form className="space-y-3" onSubmit={onCreateAgent}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="sn-code">کد</Label>
                <Input id="sn-code" className="num mt-1" value={formCode} onChange={(e) => setFormCode(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="sn-name">نام کامل</Label>
                <Input id="sn-name" className="mt-1" value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="sn-role">نقش</Label>
                <select id="sn-role" className={cn(FIELD, "mt-1")} value={formRole} onChange={(e) => setFormRole(e.target.value)}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="sn-parent">والد</Label>
                <select id="sn-parent" className={cn(FIELD, "mt-1")} value={formParent} onChange={(e) => setFormParent(e.target.value)}>
                  <option value="">— ریشه —</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.fullName} ({a.code})</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="sn-phone">موبایل</Label>
                <Input id="sn-phone" className="num mt-1" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm">
                <UserPlus className="size-3.5" aria-hidden />
                ثبت نماینده
              </Button>
              {formMsg ? <span className="text-xs text-muted-foreground">{formMsg}</span> : null}
            </div>
          </form>
        </SectionCard>
      </div>

      <SectionCard
        title="پیش‌نمایش کارمزد"
        description="صدور + وصول برای فروشنده، نظارتی بالادست، مالیات تکلیفی — DEMO_DEFAULTS"
      >
        <form className="mb-4 grid gap-3 sm:grid-cols-4" onSubmit={runPreview}>
          <div>
            <Label htmlFor="sn-premium">حق بیمه (ریال)</Label>
            <Input id="sn-premium" className="num mt-1" value={premium} onChange={(e) => setPremium(e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <Label htmlFor="sn-year">سال بیمه‌نامه (۱–۵)</Label>
            <select id="sn-year" className={cn(FIELD, "mt-1")} value={policyYear} onChange={(e) => setPolicyYear(e.target.value)}>
              {[1, 2, 3, 4, 5].map((y) => {
                const rule = issuanceRules.find((r) => r.policyYear === y);
                return (
                  <option key={y} value={y}>
                    سال {toFa(y)}
                    {rule ? ` — صدور ${toFa(rule.ratePct)}٪` : ""}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <Label htmlFor="sn-agent">نماینده فروشنده</Label>
            <select id="sn-agent" className={cn(FIELD, "mt-1")} value={previewAgentId} onChange={(e) => setPreviewAgentId(e.target.value)}>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.fullName} — {a.roleLabel}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={previewBusy || !agents.length}>
              <Wallet className="size-3.5" aria-hidden />
              محاسبه
            </Button>
          </div>
        </form>

        {preview && !preview.ok ? <p className="text-sm text-destructive">{preview.error}</p> : null}

        {preview?.ok && preview.splits ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                <p className="text-[11px] text-muted-foreground">جمع ناخالص</p>
                <p className="num mt-1 text-lg font-bold text-title">{formatNumber(preview.totals?.grossRial ?? 0)} ریال</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                <p className="text-[11px] text-muted-foreground">مالیات تکلیفی</p>
                <p className="num mt-1 text-lg font-bold text-title">{formatNumber(preview.totals?.taxRial ?? 0)} ریال</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                <p className="text-[11px] text-muted-foreground">خالص</p>
                <p className="num mt-1 text-lg font-bold text-primary">{formatNumber(preview.totals?.netRial ?? 0)} ریال</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-right font-medium">نماینده</th>
                    <th className="px-3 py-2 text-right font-medium">نوع</th>
                    <th className="px-3 py-2 text-right font-medium">نرخ</th>
                    <th className="px-3 py-2 text-right font-medium">ناخالص</th>
                    <th className="px-3 py-2 text-right font-medium">مالیات</th>
                    <th className="px-3 py-2 text-right font-medium">خالص</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.splits.map((s, i) => (
                    <tr key={`${s.agentId}-${s.kind}-${i}`} className="border-t border-border/40">
                      <td className="px-3 py-2">
                        <span className="font-medium">{s.agentName}</span>
                        <span className="ms-1 text-[11px] text-muted-foreground">{s.roleLabel}</span>
                      </td>
                      <td className="px-3 py-2">{s.kindLabel}</td>
                      <td className="num px-3 py-2">{toFa(s.ratePct)}٪</td>
                      <td className="num px-3 py-2">{formatNumber(s.grossRial)}</td>
                      <td className="num px-3 py-2">{formatNumber(s.taxRial)}</td>
                      <td className="num px-3 py-2 font-semibold">{formatNumber(s.netRial)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.disclaimer ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">{preview.disclaimer}</p>
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Plus className="size-3" aria-hidden />
        مسیر منو: سایر ← شبکه فروش · API: <span className="num">/api/sales-network/*</span>
      </p>
    </AppShell>
  );
}
