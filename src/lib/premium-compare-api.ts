/**
 * Live premium-compare via same-origin VPS:
 *   GET  /api/premium-compare/status
 *   POST /api/premium-compare/quote
 *
 * Product lock (2026-09-24): BimeBazar live + Sanhab together.
 * Mock is NEVER silent primary when live is configured or expected —
 * only explicit VITE_PREMIUM_COMPARE_SOURCE=mock (demo).
 */
import { apiFetch, apiUrl } from "@/lib/api";
import {
  BIMEBAZAR_ENV_NAMES,
  buildMockCompareRows,
  premiumCompareSource,
  sortByTotal,
  type InsurerCompareRow,
  type PremiumLine,
  type VehicleInputs,
} from "@/lib/premium-compare-mock";

export type PremiumCompareStatus = {
  ok: boolean;
  configured: boolean;
  portalUrl?: string | null;
  loginBase?: string;
  apiBase?: string;
  error?: string | null;
};

export type PremiumCompareQuoteResponse = {
  ok: boolean;
  mode?: "live" | "mock";
  line?: PremiumLine;
  offers?: Array<{
    id: string;
    name: string;
    thirdParty: number | null;
    body: number | null;
    tariff?: number | null;
    baseTariff?: number | null;
    discounts?: unknown;
    solvencyLevel?: unknown;
    line?: string;
  }>;
  count?: number;
  sanhabFailed?: boolean;
  error?: string;
  code?: string;
};

export type PremiumCompareResult = {
  rows: InsurerCompareRow[];
  mode: "live" | "mock";
  configured: boolean;
  liveOfferCount: number;
  sanhabFailed: boolean;
  error?: string;
  code?: string;
  /** Env names only — never values — when not configured */
  missingEnvNames?: readonly string[];
};

export const MSG_BIME_NOT_CONFIGURED =
  "اتصال بیمه‌بازار پیکربندی نشده — متغیرهای لازم روی api: " +
  BIMEBAZAR_ENV_NAMES.join("، ");

export const MSG_LIVE_INQUIRY_FAILED = "استعلام واقعی ناموفق";

export const MSG_SANHAB_FAILED =
  "سنهاب ناموفق — پیشنهاد ثالث از شرکای بیمه‌بازار دریافت نشد";

export async function fetchPremiumCompareStatus(): Promise<PremiumCompareStatus> {
  try {
    const res = await apiFetch(apiUrl("/api/premium-compare/status"), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { ok: false, configured: false, error: "وضعیت مقایسه در دسترس نیست" };
    }
    const data = (await res.json()) as Record<string, unknown>;
    return {
      ok: Boolean(data.ok ?? true),
      configured: Boolean(data.configured),
      portalUrl: (data.portalUrl as string | null | undefined) ?? null,
      loginBase: data.loginBase as string | undefined,
      apiBase: data.apiBase as string | undefined,
      error: (data.error as string | null | undefined) ?? null,
    };
  } catch {
    return { ok: false, configured: false, error: "وضعیت مقایسه در دسترس نیست" };
  }
}

function liveOffersToRows(
  offers: NonNullable<PremiumCompareQuoteResponse["offers"]>,
  line: PremiumLine,
): InsurerCompareRow[] {
  return offers.map((o, i) => {
    const tariff = o.tariff ?? null;
    const baseTariff = o.baseTariff ?? null;
    const third = o.thirdParty ?? (line === "third_party" ? tariff : null);
    const body = o.body ?? (line === "body" ? tariff : null);
    return {
      id: String(o.id || `live-${i}`),
      name: o.name,
      thirdParty: third,
      body,
      tariff: tariff ?? (line === "third_party" ? third : body),
      baseTariff,
      discounts: o.discounts ?? null,
      solvencyLevel: o.solvencyLevel ?? null,
    };
  });
}

function emptyLive(partial: Omit<PremiumCompareResult, "rows" | "mode" | "liveOfferCount"> & {
  liveOfferCount?: number;
}): PremiumCompareResult {
  return {
    rows: [],
    mode: "live",
    liveOfferCount: partial.liveOfferCount ?? 0,
    configured: partial.configured,
    sanhabFailed: partial.sanhabFailed,
    error: partial.error,
    code: partial.code,
    missingEnvNames: partial.missingEnvNames,
  };
}

/**
 * Prefer live partners when configured (or forced live).
 * Explicit mock only when VITE_PREMIUM_COMPARE_SOURCE=mock.
 * Never auto-fill 22 mock insurers on live fail / sanhabFailed / not configured.
 */
export async function requestPremiumCompare(
  line: PremiumLine,
  inputs: VehicleInputs,
): Promise<PremiumCompareResult> {
  const forced = premiumCompareSource();

  if (forced === "mock") {
    const rows = sortByTotal(buildMockCompareRows(inputs.financialCover));
    return {
      rows,
      mode: "mock",
      configured: false,
      liveOfferCount: 0,
      sanhabFailed: false,
      code: "explicit_mock_demo",
    };
  }

  const status = await fetchPremiumCompareStatus();
  const wantLive = forced === "live" || status.configured;

  if (!wantLive || !status.configured) {
    return emptyLive({
      configured: false,
      sanhabFailed: false,
      error: MSG_BIME_NOT_CONFIGURED,
      code: "bimebazar_env_missing",
      missingEnvNames: BIMEBAZAR_ENV_NAMES,
    });
  }

  try {
    const res = await apiFetch(apiUrl("/api/premium-compare/quote"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        line,
        nationalId: inputs.nationalId,
        financialCover: inputs.financialCover,
        year: inputs.year,
        usage: inputs.usage,
        vehicleType: inputs.vehicleType,
        plate: {
          platePart1: inputs.plate.platePart1,
          plateLetter: inputs.plate.plateLetter,
          platePart2: inputs.plate.platePart2,
          plateIranCode: inputs.plate.plateIranCode,
        },
      }),
    });
    const data = (await res.json()) as PremiumCompareQuoteResponse;
    const sanhabFailed = Boolean(data?.sanhabFailed);
    const offers = Array.isArray(data?.offers) ? data.offers : [];

    if (data?.code === "bimebazar_env_missing" || res.status === 503) {
      return emptyLive({
        configured: false,
        sanhabFailed,
        error: MSG_BIME_NOT_CONFIGURED,
        code: data?.code || "bimebazar_env_missing",
        missingEnvNames: BIMEBAZAR_ENV_NAMES,
      });
    }

    if (!data?.ok || offers.length === 0) {
      const err =
        sanhabFailed
          ? MSG_SANHAB_FAILED
          : data?.error
            ? `${MSG_LIVE_INQUIRY_FAILED} — ${data.error}`
            : MSG_LIVE_INQUIRY_FAILED;
      return emptyLive({
        configured: true,
        sanhabFailed,
        error: err,
        code: data?.code || (sanhabFailed ? "sanhab_failed" : "no_offers"),
      });
    }

    const rows = sortByTotal(liveOffersToRows(offers, line));
    return {
      rows,
      mode: "live",
      configured: true,
      liveOfferCount: rows.length,
      sanhabFailed,
      error: sanhabFailed ? MSG_SANHAB_FAILED : undefined,
      code: sanhabFailed ? "sanhab_failed" : undefined,
    };
  } catch {
    return emptyLive({
      configured: true,
      sanhabFailed: false,
      error: `${MSG_LIVE_INQUIRY_FAILED} — ارتباط با سرور برقرار نشد`,
      code: "network_error",
    });
  }
}
