/*
 * In-memory token bucket keyed by client IP. The bucket is per-process —
 * acceptable for v1 single-instance deployment. When the Functions app scales
 * to multiple instances, swap this for a Tables-backed bucket keyed off
 * (ip, hour-bucket) so rate limits hold across replicas.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const HOUR_MS = 60 * 60 * 1000;

export function checkIpRateLimit(ip: string, perHour: number, now = Date.now()): { ok: boolean; resetAt: number } {
  const existing = buckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + HOUR_MS });
    return { ok: true, resetAt: now + HOUR_MS };
  }
  if (existing.count >= perHour) {
    return { ok: false, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { ok: true, resetAt: existing.resetAt };
}

export function _resetRateLimitForTests(): void {
  buckets.clear();
}
