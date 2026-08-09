import { describe, expect, it } from "vitest";

import { corsHeaders, jsonResponse } from "../src/http/cors";
import { validConfig } from "./fixtures/config";

describe("corsHeaders", () => {
  it("does not emit wildcard CORS", () => {
    expect(corsHeaders("https://site.example", validConfig()).get("Access-Control-Allow-Origin")).toBe(
      "https://site.example",
    );
    expect(() => corsHeaders("https://destination.example", validConfig())).toThrowError("ORIGIN_DENIED");
  });

  it("adds exact-origin CORS headers to JSON responses", () => {
    const response = jsonResponse(
      { action: "allow" },
      { status: 200 },
      "https://site.example",
      validConfig(),
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://site.example");
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
  });

  it("sets the constrained browser CORS policy headers", () => {
    const headers = corsHeaders("https://site.example", validConfig());

    expect(headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(headers.get("Vary")).toBe("Origin");
  });

  it("does not allow a redirect target as a CORS origin", () => {
    const config = validConfig({ REDIRECT_URL: "https://destination.example/safe" });
    expect(() => corsHeaders("https://destination.example", config)).toThrowError("ORIGIN_DENIED");
  });
});
