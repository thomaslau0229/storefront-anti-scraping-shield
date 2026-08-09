export const MAX_PATH_LENGTH = 2_048;
export const MAX_CHECK_BODY_BYTES = 4_096;
export const MAX_SEED_BYTES = 64;
export const MAX_DWELL_MS = 300_000;
export const MAX_TRUSTED_INTERACTIONS = 100;
export const MAX_BROWSER_SIGNAL_LENGTH = 128;

export type RuntimeMode = "log_only" | "enforce";
export type DecisionAction = "allow" | "redirect";
export type RouteClass = "protected" | "excluded" | "unprotected";

export interface Env {
  DB: D1Database;
  MODE?: string;
  ALLOWED_ORIGINS_JSON: string;
  PROTECTED_PATHS_JSON: string;
  EXCLUDED_PATHS_JSON: string;
  REDIRECT_URL: string;
  SYNTHETIC_DWELL_THRESHOLD_MS?: string;
  HMAC_SECRET: string;
}

export interface AppConfig {
  mode: RuntimeMode;
  allowedOrigins: readonly string[];
  protectedPaths: readonly string[];
  excludedPaths: readonly string[];
  redirectUrl: URL;
  syntheticDwellThresholdMs: number;
}

export interface CheckRequest {
  path: string;
  visitorSeed: string;
  campaignSeed: string;
  cohortSeed: string;
  trustedInteractions: number;
  dwellMs: number;
  webdriver: boolean;
}

export interface Decision {
  action: DecisionAction;
  wouldAction: DecisionAction;
  redirectUrl?: string;
}

export interface CorrelationInput {
  visitorSeed: string;
  campaignSeed: string;
  cohortSeed: string;
  network: string;
  asn: string;
  country: string;
}

export interface CorrelationKeys {
  visitorKey: string;
  campaignKey: string;
  cohortKey: string;
  networkKey: string;
  asnKey: string;
  countryKey: string;
}
