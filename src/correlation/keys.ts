import { hmacHex, rotationBucket } from "../crypto/hmac";
import type { CorrelationInput, CorrelationKeys } from "../types";

const SESSION_ROTATION_MINUTES = 30;
const EDGE_ROTATION_MINUTES = 24 * 60;

export async function deriveCorrelationKeys(
  input: CorrelationInput,
  secret: string,
  nowMs: number,
): Promise<CorrelationKeys> {
  const sessionBucket = rotationBucket(nowMs, SESSION_ROTATION_MINUTES).toString();
  const edgeBucket = rotationBucket(nowMs, EDGE_ROTATION_MINUTES).toString();

  const [visitorKey, campaignKey, cohortKey, networkKey, asnKey, countryKey] = await Promise.all([
    hmacHex(secret, "visitor", [input.visitorSeed, sessionBucket]),
    hmacHex(secret, "campaign", [input.campaignSeed, sessionBucket]),
    hmacHex(secret, "cohort", [input.cohortSeed, sessionBucket]),
    hmacHex(secret, "network", [input.network, edgeBucket]),
    hmacHex(secret, "asn", [input.asn, edgeBucket]),
    hmacHex(secret, "country", [input.country, edgeBucket]),
  ]);

  return { visitorKey, campaignKey, cohortKey, networkKey, asnKey, countryKey };
}
