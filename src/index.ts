import { generateBrowserScript } from "./browser";
import { parseConfig } from "./config";
import { deriveCorrelationKeys } from "./correlation/keys";
import { corsHeaders, jsonResponse } from "./http/cors";
import { classifyPath, normalizePathname } from "./paths";
import { D1RiskRepository } from "./storage/repository";
import {
  MAX_CHECK_BODY_BYTES,
  MAX_DWELL_MS,
  MAX_SEED_BYTES,
  MAX_TRUSTED_INTERACTIONS,
  type AppConfig,
  type CheckRequest,
  type Decision,
  type Env,
} from "./types";

const CHECK_FIELDS = new Set([
  "path",
  "visitorSeed",
  "campaignSeed",
  "cohortSeed",
  "trustedInteractions",
  "dwellMs",
  "webdriver",
]);
const encoder = new TextEncoder();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response('{"ok":true}', {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (request.method === "GET" && url.pathname === "/shield.js") {
      return shieldResponse(request, env);
    }

    if (url.pathname === "/v1/check" && (request.method === "POST" || request.method === "OPTIONS")) {
      return checkResponse(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};

function shieldResponse(request: Request, env: Env): Response {
  let source = "void 0;";
  try {
    const config = parseConfig(env);
    source = generateBrowserScript(config, new URL(request.url).origin);
  } catch {
    // An inert script preserves fail-open rendering when configuration is unavailable.
  }

  return new Response(source, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "application/javascript; charset=utf-8",
    },
  });
}

async function checkResponse(request: Request, env: Env): Promise<Response> {
  let config: AppConfig;
  try {
    config = parseConfig(env);
  } catch {
    return plainAllow();
  }

  const origin = request.headers.get("Origin") ?? "";
  if (!config.allowedOrigins.includes(origin)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin, config) });
  }

  let input: CheckRequest;
  try {
    input = await parseCheckRequest(request);
  } catch {
    return jsonResponse({ error: "invalid_request" }, { status: 400 }, origin, config);
  }

  const routeClass = classifyPath(input.path, config);
  const wouldAction = shouldRedirect(input, routeClass, config) ? "redirect" : "allow";
  const intendedAction = config.mode === "enforce" ? wouldAction : "allow";

  try {
    if (typeof env.HMAC_SECRET !== "string" || env.HMAC_SECRET.length === 0) {
      throw new Error("KEY_UNAVAILABLE");
    }
    const occurredAt = Date.now();
    const keys = await deriveCorrelationKeys(
      {
        visitorSeed: input.visitorSeed,
        campaignSeed: input.campaignSeed,
        cohortSeed: input.cohortSeed,
        network: boundedMetadata(request.headers.get("CF-Connecting-IP"), "unknown-network"),
        asn: edgeAsn(request),
        country: edgeCountry(request),
      },
      env.HMAC_SECRET,
      occurredAt,
    );

    await new D1RiskRepository(env.DB).recordEvent({
      id: crypto.randomUUID(),
      occurredAt,
      ...keys,
      routeClass,
      routeGroup: routeClass,
      dwellMs: input.dwellMs,
      trustedInteractions: input.trustedInteractions,
      webdriver: input.webdriver,
      action: intendedAction,
      wouldAction,
    });
  } catch {
    return jsonResponse({ action: "allow", wouldAction }, { status: 200 }, origin, config);
  }

  const decision: Decision = { action: intendedAction, wouldAction };
  if (intendedAction === "redirect") {
    decision.redirectUrl = config.redirectUrl.href;
  }
  return jsonResponse(decision, { status: 200 }, origin, config);
}

async function parseCheckRequest(request: Request): Promise<CheckRequest> {
  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_CHECK_BODY_BYTES) {
    throw new Error("BODY_TOO_LARGE");
  }
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("CONTENT_TYPE");
  }

  const bytes = await readBoundedBody(request);
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  if (!isRecord(parsed) || Object.keys(parsed).length !== CHECK_FIELDS.size) {
    throw new Error("CHECK_SHAPE");
  }
  if (Object.keys(parsed).some((field) => !CHECK_FIELDS.has(field))) {
    throw new Error("CHECK_FIELD");
  }

  const path = validatePath(parsed.path);
  const visitorSeed = validateSeed(parsed.visitorSeed);
  const campaignSeed = validateSeed(parsed.campaignSeed);
  const cohortSeed = validateSeed(parsed.cohortSeed);
  const trustedInteractions = validateInteger(parsed.trustedInteractions, MAX_TRUSTED_INTERACTIONS);
  const dwellMs = validateInteger(parsed.dwellMs, MAX_DWELL_MS);
  if (typeof parsed.webdriver !== "boolean") {
    throw new Error("CHECK_WEBDRIVER");
  }

  return {
    path,
    visitorSeed,
    campaignSeed,
    cohortSeed,
    trustedInteractions,
    dwellMs,
    webdriver: parsed.webdriver,
  };
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  if (!request.body) {
    throw new Error("BODY_REQUIRED");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    length += value.byteLength;
    if (length > MAX_CHECK_BODY_BYTES) {
      await reader.cancel();
      throw new Error("BODY_TOO_LARGE");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function validatePath(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("CHECK_PATH");
  }
  return normalizePathname(value);
}

function validateSeed(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    encoder.encode(value).byteLength > MAX_SEED_BYTES
  ) {
    throw new Error("CHECK_SEED");
  }
  return value;
}

function validateInteger(value: unknown, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    throw new Error("CHECK_NUMBER");
  }
  return value as number;
}

function shouldRedirect(
  input: CheckRequest,
  routeClass: ReturnType<typeof classifyPath>,
  config: AppConfig,
): boolean {
  return (
    routeClass === "protected" &&
    input.webdriver === true &&
    input.trustedInteractions === 0 &&
    input.dwellMs <= config.syntheticDwellThresholdMs
  );
}

function boundedMetadata(value: string | null, fallback: string): string {
  if (!value || encoder.encode(value).byteLength > MAX_SEED_BYTES) {
    return fallback;
  }
  return value;
}

function edgeAsn(request: Request): string {
  const asn = request.cf?.asn;
  return typeof asn === "number" && Number.isInteger(asn) && asn >= 0 ? asn.toString() : "unknown-asn";
}

function edgeCountry(request: Request): string {
  const country = request.cf?.country;
  return typeof country === "string" && /^[A-Z]{2}$/i.test(country)
    ? country.toUpperCase()
    : "unknown-country";
}

function plainAllow(): Response {
  return new Response('{"action":"allow","wouldAction":"allow"}', {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
