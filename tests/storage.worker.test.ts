/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { D1RiskRepository, type StoredRiskEvent } from "../src/storage/repository";

interface TestEnv {
  DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
}

const testEnv = env as unknown as TestEnv;

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await testEnv.DB.prepare("DELETE FROM risk_events").run();
});

function event(overrides: Partial<StoredRiskEvent> = {}): StoredRiskEvent {
  return {
    id: "event-a",
    occurredAt: 1_000,
    visitorKey: "visitor-a",
    campaignKey: "campaign-a",
    cohortKey: "cohort",
    networkKey: "network-a",
    asnKey: "asn-a",
    countryKey: "country-a",
    routeClass: "protected",
    routeGroup: "protected",
    dwellMs: 100,
    trustedInteractions: 0,
    webdriver: false,
    action: "allow",
    wouldAction: "allow",
    ...overrides,
  };
}

describe("D1RiskRepository", () => {
  it("stores only anonymous evidence and the bounded summary", async () => {
    const repository = new D1RiskRepository(testEnv.DB);

    await repository.recordEvent(event({ webdriver: true, wouldAction: "redirect" }));

    const row = await testEnv.DB.prepare("SELECT * FROM risk_events WHERE id = ?")
      .bind("event-a")
      .first<Record<string, unknown>>();

    expect(row).toMatchObject({
      visitor_key: "visitor-a",
      network_key: "network-a",
      asn_key: "asn-a",
      country_key: "country-a",
      route_group: "protected",
      webdriver: 1,
      decision_action: "allow",
      would_action: "redirect",
    });
    expect(JSON.stringify(row)).not.toContain("198.51.100.10");
  });
});
