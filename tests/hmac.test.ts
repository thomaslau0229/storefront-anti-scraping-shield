import { describe, expect, it } from "vitest";

import { hmacHex, rotationBucket } from "../src/crypto/hmac";

describe("hmacHex", () => {
  it("returns a deterministic lower-case SHA-256 HMAC", async () => {
    const first = await hmacHex("test-secret", "visitor", ["test-session"]);
    const second = await hmacHex("test-secret", "visitor", ["test-session"]);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });

  it("normalizes bounded HMAC parts before signing", async () => {
    const padded = await hmacHex("test-secret", "visitor", [" ExampleBrowser "]);
    const normalized = await hmacHex("test-secret", "visitor", ["examplebrowser"]);

    expect(padded).toBe(normalized);
  });

  it("keeps namespaces cryptographically separate", async () => {
    const visitor = await hmacHex("test-secret", "visitor", ["test-session"]);
    const campaign = await hmacHex("test-secret", "campaign", ["test-session"]);

    expect(visitor).not.toBe(campaign);
  });

  it("matches the fixed SHA-256 vector for literal namespace and framed parts", async () => {
    const result = await hmacHex("test-secret", "unit-test", [" First ", "caf\u00e9"]);

    expect(result).toBe("96f237eb020441a64b36f0643268ecce30395783e712dec33f24ad12f5afd8e5");
  });

  it("rejects overlong normalized inputs without echoing them", async () => {
    const overlong = "x".repeat(129);
    const failure = await hmacHex("test-secret", "visitor", [overlong]).then(
      () => "",
      (error: unknown) => String(error),
    );

    expect(failure).toContain("HMAC_INPUT_TOO_LONG");
    expect(failure).not.toContain(overlong);
  });

  it("rejects malformed Unicode without echoing it", async () => {
    const malformed = "bad\uD800value";
    const failure = await hmacHex("test-secret", "visitor", [malformed]).then(
      () => "",
      (error: unknown) => String(error),
    );

    expect(failure).toContain("HMAC_INPUT_INVALID_UNICODE");
    expect(failure).not.toContain(malformed);
  });
});

describe("rotationBucket", () => {
  it("increments at the configured rotation boundary", () => {
    expect(rotationBucket(0, 30)).toBe(0);
    expect(rotationBucket(1_799_999, 30)).toBe(0);
    expect(rotationBucket(1_800_000, 30)).toBe(1);
  });
});
