import { describe, expect, it } from "vitest";

import worker from "../src/index";
import type { CheckRequest, Env } from "../src/types";
import { validEnv } from "./fixtures/config";

function check(overrides: Partial<CheckRequest> = {}): CheckRequest {
  return {
    path: "/protected",
    visitorSeed: "visitor-seed",
    campaignSeed: "campaign-seed",
    cohortSeed: "cohort-seed",
    trustedInteractions: 0,
    dwellMs: 500,
    webdriver: true,
    ...overrides,
  };
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(new URL(path, "https://worker.example"), init);
}

function checkRequest(body: unknown, origin = "https://site.example"): Request {
  const value = typeof body === "string" ? body : JSON.stringify(body);
  const result = request("/v1/check", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, "CF-Connecting-IP": "198.51.100.10" },
    body: value,
  });
  Object.defineProperty(result, "cf", { value: { asn: 64_512, country: "US" } });
  return result;
}

interface RecordedDb {
  db: D1Database;
  rows: unknown[][];
}

function recordingDb(shouldFail = false): RecordedDb {
  const rows: unknown[][] = [];
  const db = {
    prepare() {
      let values: unknown[] = [];
      return {
        bind(...bound: unknown[]) {
          values = bound;
          return this;
        },
        async run() {
          if (shouldFail) {
            throw new Error("storage unavailable");
          }
          rows.push(values);
          return { success: true };
        },
      };
    },
  } as unknown as D1Database;
  return { db, rows };
}

function env(overrides: Partial<Env> = {}, shouldFail = false): { value: Env; rows: unknown[][] } {
  const { db, rows } = recordingDb(shouldFail);
  return { value: validEnv({ DB: db, ...overrides }), rows };
}

describe("worker", () => {
  it("returns only a minimal health response", async () => {
    const response = await worker.fetch(request("/health"), {} as Env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("serves uncached JavaScript", async () => {
    const response = await worker.fetch(request("/shield.js"), validEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });

  it("returns 404 for unknown routes", async () => {
    expect((await worker.fetch(request("/unknown"), validEnv())).status).toBe(404);
  });

  it.each(["{", JSON.stringify({ ...check(), path: "/protected?value=1" }), "x".repeat(4_097)])(
    "rejects malformed or oversized input without echoing it",
    async (body) => {
      const response = await worker.fetch(checkRequest(body), validEnv());

      expect(response.status).toBe(400);
      expect(await response.text()).toBe('{"error":"invalid_request"}');
    },
  );

  it("rejects unknown input fields", async () => {
    const response = await worker.fetch(
      checkRequest({ ...check(), fullUrl: "https://site.example/protected" }),
      validEnv(),
    );

    expect(response.status).toBe(400);
  });

  it("requires an exact allowed origin", async () => {
    const response = await worker.fetch(checkRequest(check(), "https://destination.example"), validEnv());

    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("answers an exact-origin preflight without a body", async () => {
    const response = await worker.fetch(
      request("/v1/check", { method: "OPTIONS", headers: { Origin: "https://site.example" } }),
      validEnv(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://site.example");
    expect(await response.text()).toBe("");
  });

  it("allows and records an excluded route", async () => {
    const state = env();
    const response = await worker.fetch(checkRequest(check({ path: "/excluded" })), state.value);

    expect(await response.json()).toEqual({ action: "allow", wouldAction: "allow" });
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toContain("excluded");
  });

  it("records redirect intent but allows in log_only mode", async () => {
    const state = env();
    const response = await worker.fetch(checkRequest(check()), state.value);

    expect(await response.json()).toEqual({ action: "allow", wouldAction: "redirect" });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://site.example");
    expect(state.rows[0]).toContain("redirect");
    expect(JSON.stringify(state.rows)).not.toContain("198.51.100.10");
    expect(JSON.stringify(state.rows)).not.toContain("US");
  });

  it("redirects only the protected synthetic condition in enforce mode", async () => {
    const redirectState = env({ MODE: "enforce" });
    const redirect = await worker.fetch(checkRequest(check()), redirectState.value);
    expect(await redirect.json()).toEqual({
      action: "redirect",
      wouldAction: "redirect",
      redirectUrl: "https://destination.example/safe",
    });

    for (const input of [
      check({ webdriver: false }),
      check({ trustedInteractions: 1 }),
      check({ dwellMs: 1_001 }),
      check({ path: "/safe" }),
    ]) {
      const state = env({ MODE: "enforce" });
      const response = await worker.fetch(checkRequest(input), state.value);
      expect(await response.json()).toEqual({ action: "allow", wouldAction: "allow" });
    }
  });

  it("fails open when event storage fails", async () => {
    const state = env({ MODE: "enforce" }, true);
    const response = await worker.fetch(checkRequest(check()), state.value);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ action: "allow", wouldAction: "redirect" });
  });
});
