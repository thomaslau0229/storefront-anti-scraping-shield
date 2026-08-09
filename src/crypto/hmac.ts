import { MAX_BROWSER_SIGNAL_LENGTH } from "../types";

const MILLISECONDS_PER_MINUTE = 60_000;

function hasIllFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        index += 1;
        continue;
      }
    }

    if (codeUnit >= 0xd800 && codeUnit <= 0xdfff) {
      return true;
    }
  }

  return false;
}

function normalizePart(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (hasIllFormedUnicode(normalized)) {
    throw new RangeError("HMAC_INPUT_INVALID_UNICODE");
  }

  if (new TextEncoder().encode(normalized).byteLength > MAX_BROWSER_SIGNAL_LENGTH) {
    throw new RangeError("HMAC_INPUT_TOO_LONG");
  }

  return normalized;
}

function encodeParts(namespace: string, parts: readonly string[]): ArrayBuffer {
  const normalized = [normalizePart(namespace), ...parts.map(normalizePart)];
  const encoder = new TextEncoder();
  const payload = normalized.map((part) => `${encoder.encode(part).byteLength}:${part}`).join("|");
  const encoded = encoder.encode(payload);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

export async function hmacHex(secret: string, namespace: string, parts: readonly string[]): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, encodeParts(namespace, parts));

  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function rotationBucket(nowMs: number, minutes: number): number {
  if (!Number.isFinite(nowMs) || !Number.isFinite(minutes) || minutes <= 0) {
    throw new RangeError("ROTATION_BUCKET_INPUT");
  }

  return Math.floor(nowMs / (minutes * MILLISECONDS_PER_MINUTE));
}
