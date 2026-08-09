import type { CorrelationInput } from "../../src/types";

export function sampleInput(overrides: Partial<CorrelationInput> = {}): CorrelationInput {
  return {
    visitorSeed: "visitor-seed",
    campaignSeed: "campaign-seed",
    cohortSeed: "cohort-seed",
    network: "198.51.100.10",
    asn: "64512",
    country: "US",
    ...overrides,
  };
}
