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

    /**
     * The same count, without the throw. `true` if this call is within the limit.
     *
     * FOR OUTBOUND CALLS, NOT INBOUND REQUESTS. `check()` refuses a caller and 429 is the
     * right answer to them. This is for the other direction — deciding whether WE may call a
     * paid third party — where there is no caller to refuse and the correct behaviour is to
     * skip the call and take the fallback path the feature already has. Throwing there would
     * turn a degraded answer into a failed request.
     *
     * Fails OPEN on an empty key, exactly as check() does and for the same reason.
     */
    allow(key) {
      if (!key) {
        logger.warn({ limiter: name }, 'rate limiter received an empty key — not limiting');
        return true;
      }

      const result = hit(`${name}:${key}`, windowMs, limit);
      if (!result.allowed) logger.warn({ limiter: name }, 'outbound rate limit reached');
      return result.allowed;
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

/*
 * The public intake at /get-help. Five records an hour from one address.
 *
 * TIGHTER THAN IT LOOKS, AND ON PURPOSE. This is the only unauthenticated route that WRITES A
 * PERSON INTO THE REGISTER, so the abuse it invites is not scraping but pollution: a script
 * filling the verification queue with invented people, which costs a caseworker's day and
 * buries the real arrivals. Five is generous for the honest case — a family coming in together
 * would be four or five records from one phone on one connection — and useless for the other.
 *
 * IT INHERITS THE PER-INSTANCE PROBLEM AT THE TOP OF THIS FILE, and here it matters as much as
 * it does for the credential limiters: N instances means N × 5. Move it to the shared store in
 * the same change as those.
 */
export const intakeLimiter = limiter('intake', { windowMs: 60 * 60 * 1000, limit: 5 });

/*
 * The unauthenticated read surface: /api/v1/public/**, and the pages that render from it.
 *
 * WHY THIS ONE EXISTS AT ALL. Everything else under /api/v1 stands behind `route({
 * permission })`, so an anonymous flood is refused at the token check before it reaches
 * Mongo. The public event listing has no such gate — that is the whole point of it, a person
 * looking for a community meeting must not need an account — which makes it the only route
 * in this application where an anonymous caller can put load on the database by asking
 * politely and repeatedly.
 *
 * WHAT IT IS PROTECTING IS AVAILABILITY, NOT SECRECY. The data behind it is published on
 * purpose and a scraper is welcome to every byte; the concern is a loop that costs the
 * office its dashboard because a shared Atlas tier is saturated. So the limit is set well
 * above any human reading pattern and well below a script's.
 *
 * SIXTY IN FIVE MINUTES. A visitor reading the noticeboard and opening six events makes
 * seven requests; a phone with a flaky connection retrying makes a few more. Sixty leaves an
 * order of magnitude of headroom for a household behind one address — a school or an
 * internet café shares an IP, and locking those out would fall hardest on exactly the people
 * this site is for. The responses also carry a 60-second Cache-Control, so a well-behaved
 * client and any CDN in front of this never approach the limit.
 *
 * PER-INSTANCE, like every limiter in this file — N instances means N × 60. For a read-only
 * public endpoint that is an acceptable approximation, the same judgement the broad /api
 * limiter is written under. It is NOT acceptable for the credential limiters, and this one
 * should ride along with them into the shared store rather than being an argument for
 * leaving them.
 */
export const publicReadLimiter = limiter('public-read', { windowMs: 5 * 60 * 1000, limit: 60 });

/*
 * OUTBOUND, NOT INBOUND: how often this deployment may call Gemini, whoever asked.
 *
 * `aiLimiter` already caps one visitor at twenty questions per fifteen minutes, which is the
 * abuse case. THIS IS THE OTHER CASE — twenty visitors each behaving perfectly, plus the
 * WhatsApp webhook, which is not usefully keyed by IP because every message arrives from Meta.
 * Nothing in that picture is misbehaving and the outbound call rate can still land on Google's
 * quota, and a 429 from Google degrades the help widget for everybody at once.
 *
 * THIRTY A MINUTE IS BELOW THE FREE TIER'S PUBLISHED RPM for flash-lite, deliberately: the
 * point of a self-imposed limit is to stay under somebody else's, and hitting ours costs a
 * menu where hitting theirs costs a 429 and a retry storm.
 *
 * It is consumed with `allow()` rather than `check()` — see the note there. Being over this
 * limit is not an error; it is the same "no answer from the model" the guide already handles
 * by showing its menu.
 *
 * PER-INSTANCE, like every limiter in this file. For this one that is much less serious than
 * for the credential limiters: N instances means N × 30 against Google's quota, so it narrows
 * the safety margin rather than removing the guard. It still belongs in the shared-store move.
 */
export const geminiLimiter = limiter('gemini', { windowMs: 60 * 1000, limit: 30 });

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
