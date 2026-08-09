import AppError from '../utils/AppError.js';
import logger from '../config/logger.js';

/*
 * Rate limiting, rewritten for Route Handlers.
 *
 * express-rate-limit cannot come across: it is Express middleware, and its default memory
 * store assumes one long-lived process. Neither holds here.
 *
 * READ THIS BEFORE DEPLOYING. The store below is per-instance and in-memory, which is
 * exactly what the Express version was — but the number of instances changed. One Express
 * process meant one counter and a real limit. A serverless deployment runs N instances, so
 * the effective limit is N × the number configured, and a cold start resets a bucket to
 * zero. For the broad /api limiter that is an acceptable approximation of what it was for.
 *
 * FOR THE CREDENTIAL LIMITERS IT IS NOT. `auth` and `passwordReset` are what stand between
 * this system and password spraying against accounts that can read minors' identity
 * documents, and "10 attempts per instance" is not a limit. Before go-live these must move
 * to a shared store — Upstash Redis, Vercel KV, or a Mongo collection with a TTL index —
 * so the count is one number across every instance. `LIMITER_BACKEND` below is where that
 * swap goes; the call sites do not change.
 *
 * The per-account lockout in auth.service.js (five failures) is account-scoped, survives in
 * the database, and is unaffected by any of this. It is the real backstop; these limiters
 * are the cheap first line.
 */

const LIMITER_BACKEND = 'memory';

/** bucket key → { count, resetAt }. Cleared whenever the instance recycles. */
const buckets = new Map();

// Bounded so a spray across many keys cannot grow the map until the instance runs out of
// memory — which would be a denial of service delivered through the rate limiter itself.
const MAX_TRACKED_KEYS = 10_000;

function sweep(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function hit(key, windowMs, limit) {
  const now = Date.now();

  if (buckets.size > MAX_TRACKED_KEYS) sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/**
 * Build a limiter. Call it inside a handler *before* doing any work:
 *
 *   await apiLimiter.check(ctx.ip);
 *
 * Throws AppError.tooManyRequests() so an over-limit request leaves through the same
 * envelope as everything else, which is what the Express `handler: overLimit` did.
 */
function limiter(name, { windowMs, limit }) {
  return {
    name,
    limit,
    windowMs,
    check(key) {
      // An empty key means we could not identify the caller — every anonymous request
      // would share one bucket and lock each other out. Fail open and say so: a limiter
      // that cannot bucket is a bug in the deployment, not a reason to refuse service.
      if (!key) {
        logger.warn({ limiter: name }, 'rate limiter received an empty key — not limiting');
        return;
      }

      const result = hit(`${name}:${key}`, windowMs, limit);
      if (!result.allowed) {
        logger.warn({ limiter: name }, 'rate limit exceeded');
        throw AppError.tooManyRequests();
      }
    },
  };
}

/** Broad limiter for the whole /api surface. */
export const apiLimiter = limiter('api', { windowMs: 15 * 60 * 1000, limit: 300 });

/**
 * Tight limiter for credential endpoints. Keyed by IP *and* email so one attacker cannot
 * lock out a shared office IP, and one account cannot be sprayed from many addresses.
 *
 *   authLimiter.check(authKey(ctx.ip, body.email))
 */
export const authLimiter = limiter('auth', { windowMs: 15 * 60 * 1000, limit: 10 });

/**
 * For the public endpoints that call a paid model.
 *
 * Unauthenticated and metered: without a tight limit, anyone with a loop can run up an
 * OpenAI bill against a nonprofit. Generous enough that a person working through the help
 * widget never hits it — a real visitor asks a handful of questions, not sixty.
 */
export const aiLimiter = limiter('ai', { windowMs: 15 * 60 * 1000, limit: 20 });

/**
 * For authenticated endpoints that take a password or other secret — change-password
 * being the one that matters.
 *
 * Keyed by the signed-in user, NOT by IP+email: there is no email in the body to bucket
 * on, so the auth limiter's key would collapse every staff member behind one office NAT
 * address into a single allowance and let one person's typos lock out the rest.
 */
export const sensitiveActionLimiter = limiter('sensitive', { windowMs: 15 * 60 * 1000, limit: 10 });

/**
 * Very tight limiter for the recovery flows that send email — these cost money and can be
 * used to spam a third party's inbox.
 */
export const passwordResetLimiter = limiter('password-reset', { windowMs: 60 * 60 * 1000, limit: 5 });

/**
 * The IP+email key the credential limiters expect.
 *
 * Lowercased so `Ada@nwhr.org.za` and `ada@nwhr.org.za` share one bucket rather than
 * doubling an attacker's allowance for free.
 */
export function authKey(ip, email) {
  return `${ip}:${String(email ?? '').toLowerCase()}`;
}

export { LIMITER_BACKEND };
