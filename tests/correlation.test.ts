import { describe, expect, it } from "vitest";

import { deriveCorrelationKeys } from "../src/correlation/keys";
import { sampleInput } from "./fixtures/correlation";

describe("deriveCorrelationKeys", () => {
  it("keeps visitor, campaign, and cohort keys stable within a 30-minute bucket", async () => {
    const first = await deriveCorrelationKeys(sampleInput(), "test-secret", 0);
    const second = await deriveCorrelationKeys(sampleInput(), "test-secret", 30 * 60_000 - 1);

    expect(first.visitorKey).toBe(second.visitorKey);
    expect(first.campaignKey).toBe(second.campaignKey);
    expect(first.cohortKey).toBe(second.cohortKey);
  });

  it("rotates visitor, campaign, and cohort keys at the 30-minute boundary", async () => {
    const first = await deriveCorrelationKeys(sampleInput(), "test-secret", 0);
    const second = await deriveCorrelationKeys(sampleInput(), "test-secret", 30 * 60_000);

    expect(first.visitorKey).not.toBe(second.visitorKey);
    expect(first.campaignKey).not.toBe(second.campaignKey);
    expect(first.cohortKey).not.toBe(second.cohortKey);
  });

  it("keeps network, ASN, and country keys stable within a daily bucket", async () => {
    const first = await deriveCorrelationKeys(sampleInput(), "test-secret", 0);
    const second = await deriveCorrelationKeys(sampleInput(), "test-secret", 24 * 60 * 60_000 - 1);

    expect(first.networkKey).toBe(second.networkKey);
    expect(first.asnKey).toBe(second.asnKey);
    expect(first.countryKey).toBe(second.countryKey);
  });

  it("rotates network, ASN, and country keys at the daily boundary", async () => {
    const first = await deriveCorrelationKeys(sampleInput(), "test-secret", 0);
    const second = await deriveCorrelationKeys(sampleInput(), "test-secret", 24 * 60 * 60_000);

    expect(first.networkKey).not.toBe(second.networkKey);
    expect(first.asnKey).not.toBe(second.asnKey);
    expect(first.countryKey).not.toBe(second.countryKey);
  });

  it("rotates network identifiers between daily buckets", async () => {
    const first = await deriveCorrelationKeys(sampleInput(), "test-secret", Date.UTC(2026, 0, 1));
    const second = await deriveCorrelationKeys(sampleInput(), "test-secret", Date.UTC(2026, 0, 2));

    expect(first.networkKey).not.toBe(second.networkKey);
  });

  it("groups changed networks with the same coarse cohort", async () => {
    const first = await deriveCorrelationKeys(
      sampleInput({ network: "198.51.100.10" }),
      "test-secret",
      1_000,
    );
    const second = await deriveCorrelationKeys(
      sampleInput({ network: "203.0.113.20" }),
      "test-secret",
      1_000,
    );

    expect(first.networkKey).not.toBe(second.networkKey);
    expect(first.cohortKey).toBe(second.cohortKey);
  });

  it("never returns raw correlation inputs", async () => {
    const keys = JSON.stringify(await deriveCorrelationKeys(sampleInput(), "test-secret", 1_000));

    expect(keys).not.toContain("198.51.100.10");
    expect(keys).not.toContain("visitor-seed");
    expect(keys).not.toContain("US");
  });

  it("hashes bounded unknown metadata markers", async () => {
    const keys = await deriveCorrelationKeys(
      sampleInput({ network: "unknown-network", asn: "unknown-asn", country: "unknown-country" }),
      "test-secret",
      1_000,
    );

    expect(keys.asnKey).toHaveLength(64);
    expect(keys.countryKey).toHaveLength(64);
  });
});
