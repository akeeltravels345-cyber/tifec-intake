// Tiny in-memory rate limiter for login brute-force protection.
//
// NOTE: in-memory state is per-server-instance. On a single Vercel function it
// works; across many instances it's best-effort. For strict limits at scale,
// back this with Redis/Upstash. Good enough to stop simple password guessing.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateResult {
  allowed: boolean;
  retryAfterSec: number;
}

/**
 * @param key      e.g. `login:${email}` or `login:${ip}`
 * @param max      max attempts within the window
 * @param windowMs window length in ms
 */
export function rateLimit(key: string, max: number, windowMs: number): RateResult {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (b.count >= max) {
    return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }

  b.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

/** Clear a key after a successful login so good users aren't penalised. */
export function rateLimitReset(key: string): void {
  buckets.delete(key);
}
