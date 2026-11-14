import { describe, expect, test } from "bun:test";
import {
  DEMO_RATE_RIAL_PER_GRAM,
  FEE_ENTRY_PCT,
  FEE_EXIT_PCT,
  gramsToMilligrams,
  milligramsToGrams,
  previewFeesLocal,
  roundRial,
} from "./sima-zar";

describe("mg ↔ g conversion", () => {
  test("1g = 1000mg", () => {
    expect(gramsToMilligrams(1)).toBe(1000);
    expect(milligramsToGrams(1000)).toBe(1);
  });
  test("fractional grams", () => {
    expect(gramsToMilligrams(0.5)).toBe(500);
    expect(milligramsToGrams(250)).toBe(0.25);
  });
});

describe("fee math DEMO", () => {
  test("entry 1% on 1g @ demo rate", () => {
    const r = previewFeesLocal({ grams: 1, side: "entry" });
    expect(r.ok).toBe(true);
    expect(r.feePct).toBe(FEE_ENTRY_PCT);
    expect(r.assetValueRial).toBe(DEMO_RATE_RIAL_PER_GRAM);
    expect(r.feeRial).toBe(roundRial(DEMO_RATE_RIAL_PER_GRAM * 0.01));
    expect(r.totalRial).toBe(DEMO_RATE_RIAL_PER_GRAM + (r.feeRial ?? 0));
  });
  test("exit 2% on 1g", () => {
    const r = previewFeesLocal({ grams: 1, side: "exit", rateRialPerGram: 10_000_000 });
    expect(r.ok).toBe(true);
    expect(r.feePct).toBe(FEE_EXIT_PCT);
    expect(r.assetValueRial).toBe(10_000_000);
    expect(r.feeRial).toBe(200_000);
    expect(r.netRial).toBe(9_800_000);
  });
  test("rejects zero", () => {
    expect(previewFeesLocal({ grams: 0 }).ok).toBe(false);
  });
});
