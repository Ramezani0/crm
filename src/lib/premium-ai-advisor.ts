/**
 * Premium-calc AI advisor — mock when no server key; live via same-origin
 * POST /api/premium-ai/chat (Gemini generateContent on VPS — key never in browser).
 */
import { apiFetch, apiUrl } from "@/lib/api";
import { PREMIUM_AI_KNOWLEDGE, PREMIUM_AI_SYSTEM_BRIEF } from "@/lib/premium-ai-system-brief";
import {
  MISSING_FIELD_LABELS,
  MOCK_INSURER_COUNT,
  collectMissingFields,
  formatPlate,
  type InsurerCompareRow,
  type MissingFieldKey,
  type PremiumLine,
  type VehicleInputs,
} from "@/lib/premium-compare-mock";
import { formatNumber, toFa } from "@/lib/format";

export { PREMIUM_AI_SYSTEM_BRIEF, PREMIUM_AI_KNOWLEDGE };

/**
 * Mock-only label — never claim a live Gemini model id in the browser.
 * Live UI must show modelLabel from GET /api/premium-ai/status.
 */
export const PREMIUM_AI_MOCK_MODEL_LABEL = "mock";

/** @deprecated Use status.modelLabel from /api/premium-ai/status; kept for mock tests. */
export const PREMIUM_AI_MODEL = PREMIUM_AI_MOCK_MODEL_LABEL;

export type AdvisorRole = "user" | "assistant" | "system";

export type AdvisorChatMessage = {
  role: AdvisorRole;
  content: string;
};

export type AdvisorMode = "mock" | "live";

export type AdvisorReply = {
  ok: boolean;
  mode: AdvisorMode;
  content: string;
  missingFields: MissingFieldKey[];
  /** Always false — advisor must never invent premiums. */
  inventsNumbers: false;
  modelLabel: string;
  error?: string;
  code?: string;
};

export type PremiumAiStatus = {
  ok: boolean;
  configured: boolean;
  provider: string;
  model: string;
  modelLabel: string;
  error?: string | null;
};

export type AdvisorContext = {
  line: PremiumLine;
  inputs: VehicleInputs;
  /** Optional compare rows already shown — advisor may cite them, not invent. */
  rows?: InsurerCompareRow[];
};

const ADVISORY_EXTRA: Partial<Record<PremiumLine, string[]>> = {
  body: ["ارزش روز خودرو (برای بدنه)"],
};

/** Cap no-claim discount: 5% × years, max 70%. */
export function noClaimDiscountPct(yearsRaw: string): number {
  const y = Math.max(0, Math.min(99, Number.parseInt(yearsRaw.replace(/\D/g, "") || "0", 10) || 0));
  return Math.min(
    PREMIUM_AI_KNOWLEDGE.noClaimDiscountCapPct,
    y * PREMIUM_AI_KNOWLEDGE.noClaimDiscountPerYearPct,
  );
}

function knowledgeBlock(): string {
  const k = PREMIUM_AI_KNOWLEDGE;
  return [
    `دانش پایه (ایران ${toFa(k.diyaYear)}):`,
    `• دیه عادی ${formatNumber(k.diyaOrdinaryToman)} تومان · دیه حرام ${formatNumber(k.diyaHaramToman)} تومان`,
    `• حداقل پوشش مالی ثالث تقریبی ≈ ${formatNumber(k.minFinancialCoverToman)} تومان`,
    `• تخفیف عدم خسارت: حدود ${toFa(k.noClaimDiscountPerYearPct)}٪ در سال تا سقف ${toFa(k.noClaimDiscountCapPct)}٪`,
    `• جدول مقایسه باید همه شرکت‌های برگشتی را نشان دهد (بدون برش ۳–۵ تایی)`,
  ].join("\n");
}

/**
 * Deterministic mock advisor: asks for missing fields, never invents premium numbers.
 * Uses the locked system brief rules + product knowledge.
 */
export function mockAdvise(
  ctx: AdvisorContext,
  userMessage = "",
): AdvisorReply {
  const missing = collectMissingFields(ctx.line, ctx.inputs);
  const extras =
    ctx.line === "body" && !(ctx.inputs as VehicleInputs & { vehicleValue?: string }).vehicleValue
      ? ADVISORY_EXTRA.body ?? []
      : [];

  if (missing.length > 0 || extras.length > 0) {
    const lines = [
      "برای ادامه مشاوره، این موارد لازم است (عدد جعلی نمی‌سازم):",
      ...missing.map((k) => `• ${MISSING_FIELD_LABELS[k]}`),
      ...extras.map((e) => `• ${e}`),
      "",
      knowledgeBlock(),
      "",
      "پس از تکمیل فیلدها، همه شرکت‌های برگشتی را در جدول لیست می‌کنم.",
    ];
    if (userMessage.trim()) {
      lines.unshift(`دریافت شد؛ هنوز داده ناقص است.`);
      lines.unshift("");
    }
    return {
      ok: true,
      mode: "mock",
      content: lines.join("\n"),
      missingFields: missing,
      inventsNumbers: false,
      modelLabel: PREMIUM_AI_MOCK_MODEL_LABEL,
    };
  }

  const plate = formatPlate(ctx.inputs.plate) || "—";
  const ncd = noClaimDiscountPct(ctx.inputs.noClaimYears);
  const rowCount = ctx.rows?.length ?? MOCK_INSURER_COUNT;
  const lines = [
    "مشاور mock (کلید AI روی سرور نیست یا پاسخ زنده در دسترس نیست) — عدد حق‌بیمه جعلی نمی‌سازم.",
    "",
    knowledgeBlock(),
    "",
    `خلاصه ورودی: پلاک ${plate} · تب ${ctx.line === "third_party" ? "ثالث" : "بدنه"} · کاربری ${ctx.inputs.usage} · سال ${toFa(ctx.inputs.year)}`,
    ctx.inputs.financialCover != null
      ? `پوشش مالی ثالث: ${formatNumber(ctx.inputs.financialCover)} تومان`
      : null,
    ctx.inputs.noClaimYears
      ? `تخفیف عدم خسارت برآوردی از سابقه: حدود ${toFa(ncd)}٪ (سقف ${toFa(PREMIUM_AI_KNOWLEDGE.noClaimDiscountCapPct)}٪) — فقط راهنما، نه قیمت نهایی`
      : null,
    "",
    `در جدول مقایسه ${toFa(rowCount)} شرکت را کامل ببینید (بدون truncate). منبع فعلی: برآورد/mock تا استعلام زنده.`,
    "ارزان‌ترین جمع ≠ لزوماً بهترین پوشش؛ پوشش و سابقه را با مشتری شفاف کنید.",
  ].filter((x): x is string => Boolean(x));

  if (userMessage.trim()) {
    lines.push("", `یادداشت شما: ${userMessage.trim().slice(0, 500)}`);
  }

  // Explicitly refuse to invent a made-up premium figure in free text
  lines.push("", "اگر قیمت عددی می‌خواهید، فقط از ردیف‌های جدول استعلام/mock استفاده کنید — من عدد جدید نمی‌سازم.");

  return {
    ok: true,
    mode: "mock",
    content: lines.join("\n"),
    missingFields: [],
    inventsNumbers: false,
    modelLabel: PREMIUM_AI_MOCK_MODEL_LABEL,
  };
}

export function buildAdvisorUserPayload(ctx: AdvisorContext, userMessage: string): string {
  const missing = collectMissingFields(ctx.line, ctx.inputs);
  const parts = [
    `تب: ${ctx.line === "third_party" ? "ثالث" : "بدنه"}`,
    `پلاک: ${formatPlate(ctx.inputs.plate) || "ناقص"}`,
    `کد ملی وارد شده: ${ctx.inputs.nationalId ? "بله" : "خیر"}`,
    ctx.inputs.financialCover != null
      ? `پوشش مالی: ${ctx.inputs.financialCover} تومان`
      : "پوشش مالی: نامشخص",
    `سال ساخت: ${ctx.inputs.year || "—"}`,
    `کاربری: ${ctx.inputs.usage || "—"}`,
    `نوع: ${ctx.inputs.vehicleType || "—"}`,
    `عدم خسارت (سال): ${ctx.inputs.noClaimYears || "—"}`,
    `شهر: ${ctx.inputs.city || "—"}`,
    missing.length ? `فیلدهای ناقص UI: ${missing.map((k) => MISSING_FIELD_LABELS[k]).join("، ")}` : "فیلدهای اجباری UI کامل است",
    ctx.rows?.length
      ? `تعداد شرکت در جدول فعلی: ${ctx.rows.length} (همه را لیست کن؛ عدد جدید نساز)`
      : "هنوز جدول مقایسه ساخته نشده",
    userMessage.trim() ? `پیام کاربر: ${userMessage.trim().slice(0, 2000)}` : "پیام کاربر: (مشاوره اولیه)",
  ];
  return parts.join("\n");
}

export async function fetchPremiumAiStatus(): Promise<PremiumAiStatus> {
  try {
    const res = await apiFetch(apiUrl("/api/premium-ai/status"), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return {
        ok: false,
        configured: false,
        provider: "gemini",
        model: "",
        modelLabel: PREMIUM_AI_MOCK_MODEL_LABEL,
        error: "status_http",
      };
    }
    const data = (await res.json()) as PremiumAiStatus;
    const model = (data.model || "").trim();
    const modelLabel = (data.modelLabel || model || PREMIUM_AI_MOCK_MODEL_LABEL).trim();
    return {
      ok: Boolean(data.ok),
      configured: Boolean(data.configured),
      provider: data.provider || "gemini",
      model,
      modelLabel,
      error: data.error ?? null,
    };
  } catch {
    return {
      ok: false,
      configured: false,
      provider: "gemini",
      model: "",
      modelLabel: PREMIUM_AI_MOCK_MODEL_LABEL,
      error: "status_network",
    };
  }
}

/**
 * Prefer live Gemini via VPS proxy; fall back to mock (never invents numbers).
 * System brief is applied server-side — browser only sends user/context messages.
 * Body shape is always { messages: [{ role, content }] }.
 */
export async function askPremiumAdvisor(
  ctx: AdvisorContext,
  userMessage = "",
): Promise<AdvisorReply> {
  const status = await fetchPremiumAiStatus();
  if (!status.configured) {
    return mockAdvise(ctx, userMessage);
  }

  const payload = {
    messages: [
      { role: "user" as const, content: buildAdvisorUserPayload(ctx, userMessage) },
    ],
  };

  try {
    const res = await apiFetch(apiUrl("/api/premium-ai/chat"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      content?: string;
      error?: string;
      code?: string;
      modelLabel?: string;
      mode?: string;
    };
    if (!res.ok || !data.ok || !data.content?.trim()) {
      const fallback = mockAdvise(ctx, userMessage);
      return {
        ...fallback,
        error: data.error || "live_failed",
        code: data.code || "premium_ai_live_failed",
      };
    }
    return {
      ok: true,
      mode: "live",
      content: data.content.trim(),
      missingFields: collectMissingFields(ctx.line, ctx.inputs),
      inventsNumbers: false,
      modelLabel: data.modelLabel || status.modelLabel || PREMIUM_AI_MOCK_MODEL_LABEL,
    };
  } catch {
    return mockAdvise(ctx, userMessage);
  }
}
