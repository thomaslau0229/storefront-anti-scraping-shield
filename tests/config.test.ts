import { describe, expect, it } from "vitest";

import { parseConfig } from "../src/config";
import { validEnv } from "./fixtures/config";

export { validConfig, validEnv } from "./fixtures/config";

describe("parseConfig", () => {
  it("defaults to log_only", () => {
    expect(parseConfig(validEnv()).mode).toBe("log_only");
    const env = validEnv();
    delete env.MODE;
    expect(parseConfig(env).mode).toBe("log_only");
  });

  it("rejects a redirect destination that remains protected", () => {
    const env = validEnv({ REDIRECT_URL: "https://site.example/protected", EXCLUDED_PATHS_JSON: "[]" });
    expect(() => parseConfig(env)).toThrowError("CONFIG_REDIRECT_LOOP");
  });

  it("rejects an allowed-origin redirect destination that is not excluded", () => {
    const env = validEnv({ REDIRECT_URL: "https://site.example/safe", EXCLUDED_PATHS_JSON: '["/excluded"]' });
    expect(() => parseConfig(env)).toThrowError("CONFIG_REDIRECT_LOOP");
  });

  it("allows an exact configured HTTPS destination on another origin", () => {
    const config = parseConfig(validEnv({ REDIRECT_URL: "https://destination.example/safe" }));
    expect(config.redirectUrl.href).toBe("https://destination.example/safe");
  });

  it("rejects a redirect destination that is not HTTPS", () => {
    const env = validEnv({ REDIRECT_URL: "http://destination.example/safe" });
    expect(() => parseConfig(env)).toThrowError("CONFIG_REDIRECT_URL");
  });

  it("loads the conservative synthetic dwell threshold", () => {
    expect(parseConfig(validEnv()).syntheticDwellThresholdMs).toBe(1_000);
  });

  it.each(["0", "10001", "1.5"])('rejects invalid synthetic dwell threshold "%s"', (value) => {
    expect(() => parseConfig(validEnv({ SYNTHETIC_DWELL_THRESHOLD_MS: value }))).toThrowError(
      "CONFIG_SYNTHETIC_DWELL_THRESHOLD",
    );
  });
});
