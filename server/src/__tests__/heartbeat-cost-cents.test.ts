import { describe, expect, it } from "vitest";
import { normalizeBilledCostCents } from "../services/heartbeat.ts";

describe("normalizeBilledCostCents", () => {
  it("returns 0 for non-numeric costUsd values", () => {
    expect(normalizeBilledCostCents(null, "subscription_included")).toBe(0);
    expect(normalizeBilledCostCents(undefined, "subscription_included")).toBe(0);
    expect(normalizeBilledCostCents("not-a-number" as unknown as number, "subscription_included")).toBe(0);
  });

  it("rounds costUsd to cents for metered_api", () => {
    expect(normalizeBilledCostCents(1.2345, "metered_api")).toBe(123);
    expect(normalizeBilledCostCents(0.01, "metered_api")).toBe(1);
    expect(normalizeBilledCostCents(0.005, "metered_api")).toBe(1);
  });

  it("rounds costUsd to cents for subscription_included", () => {
    expect(normalizeBilledCostCents(1.2345, "subscription_included")).toBe(123);
    expect(normalizeBilledCostCents(0.01, "subscription_included")).toBe(1);
    expect(normalizeBilledCostCents(0.005, "subscription_included")).toBe(1);
  });

  it("rounds costUsd to cents for subscription_overage", () => {
    expect(normalizeBilledCostCents(1.2345, "subscription_overage")).toBe(123);
  });

  it("clamps negative costs to 0", () => {
    expect(normalizeBilledCostCents(-1.5, "subscription_included")).toBe(0);
  });

  it("treats NaN and Infinity as 0", () => {
    expect(normalizeBilledCostCents(Number.NaN, "subscription_included")).toBe(0);
    expect(normalizeBilledCostCents(Number.POSITIVE_INFINITY, "subscription_included")).toBe(0);
  });
});