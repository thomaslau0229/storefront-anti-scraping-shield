import { parseConfig } from "../../src/config";
import type { AppConfig, Env } from "../../src/types";

export function validEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    MODE: "log_only",
    ALLOWED_ORIGINS_JSON: '["https://site.example"]',
    PROTECTED_PATHS_JSON: '["/protected"]',
    EXCLUDED_PATHS_JSON: '["/excluded","/safe"]',
    REDIRECT_URL: "https://destination.example/safe",
    SYNTHETIC_DWELL_THRESHOLD_MS: "1000",
    HMAC_SECRET: "unit-test-hmac-secret",
    ...overrides,
  };
}

export function validConfig(overrides: Partial<Env> = {}): AppConfig {
  return parseConfig(validEnv(overrides));
}
