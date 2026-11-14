import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  BIMEBAZAR_ENV_NAMES,
  DEFAULT_VEHICLE_INPUTS,
  PLATE_LETTERS,
  premiumCompareSource,
  type VehicleInputs,
} from "./premium-compare-mock";
import {
  MSG_BIME_NOT_CONFIGURED,
  MSG_LIVE_INQUIRY_FAILED,
  MSG_SANHAB_FAILED,
  requestPremiumCompare,
} from "./premium-compare-api";

/**
 * Plate map assumption (UI → BimeBazar), mirrored in vps/bimebazar_client.py:
 *   platePart1 → plk1
 *   plateLetter → plk2 (0-based index in PLATE_LETTERS; ب → "1")
 *   platePart2 → plk3
 *   plateIranCode → plkSrl
 */
function mapPlateToPlk(plate: {
  platePart1: string;
  plateLetter: string;
  platePart2: string;
  plateIranCode: string;
}) {
  const idx = (PLATE_LETTERS as readonly string[]).indexOf(plate.plateLetter);
  if (idx < 0) throw new Error("bad letter");
  return {
    plk1: plate.platePart1,
    plk2: String(idx),
    plk3: plate.platePart2,
    plkSrl: plate.plateIranCode,
  };
}

const completeInputs: VehicleInputs = {
  ...DEFAULT_VEHICLE_INPUTS,
  plate: { platePart1: "12", plateLetter: "ب", platePart2: "345", plateIranCode: "63" },
  nationalId: "0013542419",
  financialCover: 70_000_000,
  year: "1402",
  usage: "شخصی",
  vehicleType: "سواری",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("plate map UI → plk*", () => {
  test("maps 12|ب|345|ایران 63 like partners session", () => {
    expect(
      mapPlateToPlk({
        platePart1: "12",
        plateLetter: "ب",
        platePart2: "345",
        plateIranCode: "63",
      }),
    ).toEqual({ plk1: "12", plk2: "1", plk3: "345", plkSrl: "63" });
  });
});

describe("premiumCompareSource", () => {
  test("defaults to auto (not silent mock)", () => {
    const src = premiumCompareSource();
    expect(["auto", "live", "mock"]).toContain(src);
  });
});

describe("requestPremiumCompare — no silent mock", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test("not configured → empty rows + env names, NOT 22 mock", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/premium-compare/status")) {
        return jsonResponse({ ok: true, configured: false });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    const result = await requestPremiumCompare("third_party", completeInputs);
    if (premiumCompareSource() === "mock") {
      // explicit demo env — skip assertion shape
      expect(result.mode).toBe("mock");
      return;
    }
    expect(result.rows).toEqual([]);
    expect(result.mode).toBe("live");
    expect(result.configured).toBe(false);
    expect(result.liveOfferCount).toBe(0);
    expect(result.error).toContain("بیمه‌بازار");
    expect(result.error).toBe(MSG_BIME_NOT_CONFIGURED);
    expect(result.missingEnvNames).toEqual([...BIMEBAZAR_ENV_NAMES]);
    expect(result.code).toBe("bimebazar_env_missing");
  });

  test("sanhabFailed → empty rows + clear message, NOT mock fill", async () => {
    if (premiumCompareSource() === "mock") return;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/status")) {
        return jsonResponse({ ok: true, configured: true });
      }
      if (url.includes("/quote")) {
        return jsonResponse({
          ok: false,
          offers: [],
          sanhabFailed: true,
          code: "sanhab_failed",
          error: "sb_query_failed",
        });
      }
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;

    const result = await requestPremiumCompare("third_party", completeInputs);
    expect(result.rows).toEqual([]);
    expect(result.mode).toBe("live");
    expect(result.sanhabFailed).toBe(true);
    expect(result.liveOfferCount).toBe(0);
    expect(result.error).toBe(MSG_SANHAB_FAILED);
    expect(result.code).toBe("sanhab_failed");
  });

  test("live fail / empty offers → استعلام واقعی ناموفق, not mock", async () => {
    if (premiumCompareSource() === "mock") return;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/status")) {
        return jsonResponse({ ok: true, configured: true });
      }
      if (url.includes("/quote")) {
        return jsonResponse({ ok: false, offers: [], error: "timeout" });
      }
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;

    const result = await requestPremiumCompare("body", completeInputs);
    expect(result.rows).toEqual([]);
    expect(result.mode).toBe("live");
    expect(result.sanhabFailed).toBe(false);
    expect(result.error?.startsWith(MSG_LIVE_INQUIRY_FAILED)).toBe(true);
  });

  test("live offers → rows from partners, liveOfferCount matches", async () => {
    if (premiumCompareSource() === "mock") return;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/status")) {
        return jsonResponse({ ok: true, configured: true });
      }
      if (url.includes("/quote")) {
        return jsonResponse({
          ok: true,
          offers: [
            {
              id: "a",
              name: "بیمه الف",
              thirdParty: 1_000_000,
              body: null,
              tariff: 1_000_000,
              baseTariff: 950_000,
              discounts: { noClaim: 5 },
              solvencyLevel: 3,
            },
            {
              id: "b",
              name: "بیمه ب",
              thirdParty: 900_000,
              body: null,
              tariff: 900_000,
              baseTariff: 880_000,
              discounts: "۱۰٪",
              solvencyLevel: 2,
            },
          ],
          count: 2,
          sanhabFailed: false,
        });
      }
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;

    const result = await requestPremiumCompare("third_party", completeInputs);
    expect(result.mode).toBe("live");
    expect(result.configured).toBe(true);
    expect(result.rows.length).toBe(2);
    expect(result.liveOfferCount).toBe(2);
    expect(result.sanhabFailed).toBe(false);
    expect(result.rows[0]?.name).toBe("بیمه ب"); // sorted cheapest first
    expect(result.rows[0]?.tariff).toBe(900_000);
    expect(result.rows[0]?.baseTariff).toBe(880_000);
    expect(result.rows[0]?.discounts).toBe("۱۰٪");
    expect(result.rows[0]?.solvencyLevel).toBe(2);
    expect(result.rows[1]?.solvencyLevel).toBe(3);
  });

  test("network error when configured → empty + Retry message, not mock", async () => {
    if (premiumCompareSource() === "mock") return;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/status")) {
        return jsonResponse({ ok: true, configured: true });
      }
      throw new Error("network down");
    }) as typeof fetch;

    const result = await requestPremiumCompare("third_party", completeInputs);
    expect(result.rows).toEqual([]);
    expect(result.mode).toBe("live");
    expect(result.code).toBe("network_error");
    expect(result.error?.includes(MSG_LIVE_INQUIRY_FAILED)).toBe(true);
  });
});
