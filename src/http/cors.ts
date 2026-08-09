import type { AppConfig } from "../types";

export function corsHeaders(origin: string, config: AppConfig): Headers {
  if (!config.allowedOrigins.includes(origin)) {
    throw new Error("ORIGIN_DENIED");
  }

  return new Headers({
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  });
}

export function jsonResponse(body: unknown, init: ResponseInit, origin: string, config: AppConfig): Response {
  const headers = new Headers(init.headers);
  for (const [name, value] of corsHeaders(origin, config)) {
    headers.set(name, value);
  }
  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body) ?? "null", { ...init, headers });
}
