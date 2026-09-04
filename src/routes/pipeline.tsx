import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, LayoutGrid, Plus, Table2, User } from "lucide-react";
import { AppShell, SectionCard } from "@/components/app-shell";
import { EmptyState, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounced, useStore } from "@/lib/store";
import { compactRial, formatDate, formatNumber, relativeDays, toFa } from "@/lib/format";
import { LOST_STAGE, PIPELINE_STAGES, type Opportunity, type PipelineStage } from "@/lib/types";
import { STAGE_TONE, totalValue, weighted } from "@/components/pipeline/pipeline-utils";
import { DealDrawer } from "@/components/pipeline/deal-drawer";
import { NewLeadDialog } from "@/components/pipeline/new-lead-dialog";

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "قیف فروش و سرنخ‌ها | CRM فصیحی" },
      {
        name: "description",
        content: "مدیریت سرنخ‌ها و فرصت‌های فروش بیمه در قالب برد کانبان، تایم‌لاین فعالیت و تبدیل به بیمه‌گذار.",
      },
      { property: "og:title", content: "قیف فروش CRM فصیحی" },
      { property: "og:description", content: "پیگیری سرنخ‌های تماس، واتساپ، اینستاگرام و تمدید بیمه‌نامه." },
    ],
  }),
  component: PipelinePage,
});

const ALL_STAGES: PipelineStage[] = [...PIPELINE_STAGES, LOST_STAGE];
const selectClass = "h-9 rounded-md border border-input bg-card px-3 text-sm";

function DealCard({
  deal,
  today,
  editable,
  onOpen,
  onMove,
  onDragStart,
}: {
  deal: Opportunity;
  today: Date;
  editable: boolean;
  onOpen: () => void;
  onMove: (stage: PipelineStage) => void;
  onDragStart: () => void;
}) {
  const late = relativeDays(deal.nextActionAt, today) < 0 && deal.stage !== LOST_STAGE;
  return (
    <article
      draggable={editable}
      onDragStart={onDragStart}
      className="glass rounded-xl border border-border/60 p-3 text-sm transition-shadow hover:shadow-lg"
    >
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <p className="font-semibold">{deal.contactName}</p>
        <p className="text-[11px] text-muted-foreground">
          {deal.product} — {deal.city}
        </p>
        <p className="num mt-2 font-bold">{formatNumber(deal.expectedPremium)} ریال</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="rounded-full border border-border bg-secondary/60 px-2 py-0.5">{deal.source}</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <User className="size-3" aria-hidden />
            {deal.owner}
          </span>
        </div>
        <p
          className={`mt-2 flex items-center gap-1 text-[11px] ${late ? "font-semibold text-destructive" : "text-muted-foreground"}`}
        >
          {late ? <AlertTriangle className="size-3" aria-hidden /> : <CalendarClock className="size-3" aria-hidden />}
          {formatDate(deal.nextActionAt)} — {deal.nextAction}
        </p>
      </button>
      {editable && (
        <select
          className="mt-2 h-8 w-full rounded-md border border-input bg-card px-2 text-[11px]"
          value={deal.stage}
          onChange={(e) => onMove(e.target.value as PipelineStage)}
          aria-label={`انتقال فرصت ${deal.contactName} به مرحله دیگر`}
        >
          {ALL_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
    </article>
  );
}

function PipelinePage() {
  const { opportunities, hydrated, today, can, moveOpportunity } = useStore();
  const [view, setView] = useState<"board" | "table">("board");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [source, setSource] = useState("all");
  const [product, setProduct] = useState("all");
  const [owner, setOwner] = useState("all");
  const [sort, setSort] = useState("premium");
  const [page, setPage] = useState(1);
  const [showLost, setShowLost] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const q = useDebounced(search, 300);
  const editable = can("pipeline.edit");

  const sources = useMemo(() => [...new Set(opportunities.map((o) => o.source))], [opportunities]);
  const products = useMemo(() => [...new Set(opportunities.map((o) => o.product))], [opportunities]);
  const owners = useMemo(() => [...new Set(opportunities.map((o) => o.owner))], [opportunities]);

  const filtered = useMemo(() => {
    const term = q.trim();
    const list = opportunities.filter(
      (o) =>
        (stage === "all" || o.stage === stage) &&
        (source === "all" || o.source === source) &&
        (product === "all" || o.product === product) &&
        (owner === "all" || o.owner === owner) &&
        (!term || o.contactName.includes(term) || o.phone.includes(term) || o.title.includes(term)),
    );
    return list.sort((a, b) =>
      sort === "premium"
        ? b.expectedPremium - a.expectedPremium
        : sort === "next"
          ? +new Date(a.nextActionAt) - +new Date(b.nextActionAt)
          : +new Date(b.updatedAt) - +new Date(a.updatedAt),
    );
  }, [opportunities, q, stage, source, product, owner, sort]);

  const board = useMemo(
    () => (showLost ? ALL_STAGES : PIPELINE_STAGES).map((s) => ({ stage: s, items: filtered.filter((o) => o.stage === s) })),
    [filtered, showLost],
  );

  const open = filtered.filter((o) => o.stage !== LOST_STAGE);
  const rows = filtered.slice((page - 1) * 12, page * 12);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
  const deal = opportunities.find((o) => o.id === openId) ?? null;

  return (
    <AppShell
      title="قیف فروش"
      subtitle={`${formatNumber(open.length)} فرصت باز — ارزش وزنی ${compactRial(weighted(open))} ریال`}
      permission="pipeline.view"
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => setView(view === "board" ? "table" : "board")}>
            {view === "board" ? <Table2 className="size-4" aria-hidden /> : <LayoutGrid className="size-4" aria-hidden />}
            {view === "board" ? "نمای جدول" : "نمای کانبان"}
          </Button>
          {editable && (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" aria-hidden />
              سرنخ جدید
            </Button>
          )}
        </>
      }
    >
      <SectionCard>
        <div className="flex flex-wrap gap-3">
          <Input
            className="max-w-xs"
            placeholder="نام مخاطب یا شماره تماس…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="جست‌وجوی فرصت فروش"
          />
          <select className={selectClass} value={stage} onChange={(e) => setStage(e.target.value)} aria-label="مرحله">
            <option value="all">همه مراحل</option>
            {ALL_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select className={selectClass} value={source} onChange={(e) => setSource(e.target.value)} aria-label="منبع">
            <option value="all">همه منابع</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select className={selectClass} value={product} onChange={(e) => setProduct(e.target.value)} aria-label="رشته بیمه">
            <option value="all">همه رشته‌ها</option>
            {products.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select className={selectClass} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="کارشناس">
            <option value="all">همه کارشناسان</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select className={selectClass} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="مرتب‌سازی">
            <option value="premium">بیشترین حق بیمه</option>
            <option value="next">نزدیک‌ترین اقدام</option>
            <option value="updated">آخرین به‌روزرسانی</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={showLost} onChange={(e) => setShowLost(e.target.checked)} />
            نمایش ستون «از دست رفته»
          </label>
        </div>
      </SectionCard>

      {!hydrated ? (
        <SectionCard>
          <TableSkeleton rows={6} cols={5} />
        </SectionCard>
      ) : filtered.length === 0 ? (
        <SectionCard>
          <EmptyState
            title="فرصتی با این فیلترها یافت نشد"
            description="فیلترها را بازنشانی کنید یا یک سرنخ جدید ثبت کنید."
          />
        </SectionCard>
      ) : view === "board" ? (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
          {board.map((col) => (
            <section
              key={col.stage}
              onDragOver={(e) => editable && e.preventDefault()}
              onDrop={() => {
                if (!editable || !dragId) return;
                moveOpportunity(dragId, col.stage, col.stage === LOST_STAGE ? "نامشخص" : undefined);
                setDragId(null);
              }}
              className="w-[268px] shrink-0 snap-start rounded-2xl border border-border/60 bg-card/40 p-3"
              aria-label={`مرحله ${col.stage}`}
            >
              <header className="mb-3 flex items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STAGE_TONE[col.stage]}`}>
                  {col.stage}
                </span>
                <span className="num text-[11px] text-muted-foreground">{toFa(col.items.length)}</span>
                <span className="num ms-auto text-[11px] text-muted-foreground">
                  {compactRial(totalValue(col.items))}
                </span>
              </header>
              <div className="space-y-2">
                {col.items.map((d) => (
                  <DealCard
                    key={d.id}
                    deal={d}
                    today={today}
                    editable={editable}
                    onOpen={() => setOpenId(d.id)}
                    onMove={(s) => moveOpportunity(d.id, s, s === LOST_STAGE ? "نامشخص" : undefined)}
                    onDragStart={() => setDragId(d.id)}
                  />
                ))}
                {col.items.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[11px] text-muted-foreground">
                    فرصتی در این مرحله نیست
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start">مخاطب</th>
                  <th className="p-2 text-start">رشته</th>
                  <th className="p-2 text-start">منبع</th>
                  <th className="p-2 text-start">مرحله</th>
                  <th className="p-2 text-start">حق بیمه (ریال)</th>
                  <th className="p-2 text-start">احتمال</th>
                  <th className="p-2 text-start">کارشناس</th>
                  <th className="p-2 text-start">اقدام بعدی</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    tabIndex={0}
                    onClick={() => setOpenId(o.id)}
                    onKeyDown={(e) => e.key === "Enter" && setOpenId(o.id)}
                    className="cursor-pointer border-b border-border/50 hover:bg-secondary/40 focus-visible:bg-secondary/60 focus-visible:outline-none"
                  >
                    <td className="p-2 font-medium">{o.contactName}</td>
                    <td className="p-2">{o.product}</td>
                    <td className="p-2 text-xs text-muted-foreground">{o.source}</td>
                    <td className="p-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STAGE_TONE[o.stage]}`}>{o.stage}</span>
                    </td>
                    <td className="num p-2">{formatNumber(o.expectedPremium)}</td>
                    <td className="num p-2">٪{toFa(o.probability)}</td>
                    <td className="p-2 text-xs">{o.owner}</td>
                    <td className="p-2 text-xs text-muted-foreground">{formatDate(o.nextActionAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              صفحه {toFa(page)} از {toFa(pageCount)}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                قبلی
              </Button>
              <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
                بعدی
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      <DealDrawer deal={deal} onClose={() => setOpenId(null)} />
      <NewLeadDialog open={newOpen} onOpenChange={setNewOpen} />
    </AppShell>
  );
}
