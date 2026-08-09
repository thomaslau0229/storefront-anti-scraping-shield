import { classifyPath, normalizePathname } from "./paths";
import type { AppConfig, Env, RuntimeMode } from "./types";

const DEFAULT_SYNTHETIC_DWELL_THRESHOLD_MS = 1_000;
const MAX_SYNTHETIC_DWELL_THRESHOLD_MS = 10_000;

export function parseConfig(env: Env): AppConfig {
  const allowedOrigins = parseOrigins(env.ALLOWED_ORIGINS_JSON);
  const protectedPaths = parsePaths(env.PROTECTED_PATHS_JSON);
  const excludedPaths = parsePaths(env.EXCLUDED_PATHS_JSON);
  const redirectUrl = parseRedirectUrl(env.REDIRECT_URL);

  const config: AppConfig = {
    mode: parseMode(env.MODE),
    allowedOrigins,
    protectedPaths,
    excludedPaths,
    redirectUrl,
    syntheticDwellThresholdMs: parseSyntheticDwellThreshold(env.SYNTHETIC_DWELL_THRESHOLD_MS),
  };

  if (
    allowedOrigins.includes(redirectUrl.origin) &&
    classifyPath(redirectUrl.pathname, config) !== "excluded"
  ) {
    throw new Error("CONFIG_REDIRECT_LOOP");
  }

  return config;
}

function parseMode(mode: string | undefined): RuntimeMode {
  if (mode === undefined || mode === "") {
    return "log_only";
  }
  if (mode === "log_only" || mode === "enforce") {
    return mode;
  }
  throw new Error("CONFIG_MODE");
}

function parseOrigins(value: string): readonly string[] {
  const origins = parseStringArray(value, "CONFIG_ALLOWED_ORIGINS").map((origin) => {
    const url = parseUrl(origin, "CONFIG_ALLOWED_ORIGINS");
    if (url.origin !== origin || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("CONFIG_ALLOWED_ORIGINS");
    }
    return url.origin;
  });

  if (origins.length === 0 || new Set(origins).size !== origins.length) {
    throw new Error("CONFIG_ALLOWED_ORIGINS");
  }
  return origins;
}

function parsePaths(value: string): readonly string[] {
  return [...new Set(parseStringArray(value, "CONFIG_PATHS").map(normalizePathname))];
}

function parseUrl(value: string, errorCode: string): URL {
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
      throw new Error();
    }
    return url;
  } catch {
    throw new Error(errorCode);
  }
}

function parseRedirectUrl(value: string): URL {
  const url = parseUrl(value, "CONFIG_REDIRECT_URL");
  if (url.protocol !== "https:" || url.search || url.hash) {
    throw new Error("CONFIG_REDIRECT_URL");
  }
  return url;
}

function parseSyntheticDwellThreshold(value: string | undefined): number {
  if (value === undefined || value === "") {
    return DEFAULT_SYNTHETIC_DWELL_THRESHOLD_MS;
  }
  const milliseconds = Number(value);
  if (
    !Number.isInteger(milliseconds) ||
    milliseconds < 1 ||
    milliseconds > MAX_SYNTHETIC_DWELL_THRESHOLD_MS
  ) {
    throw new Error("CONFIG_SYNTHETIC_DWELL_THRESHOLD");
  }
  return milliseconds;
}

function parseStringArray(value: string, errorCode: string): readonly string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error(errorCode);
  }
}
