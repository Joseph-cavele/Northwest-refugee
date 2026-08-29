import env from './env.js';
import logger from './logger.js';

// The model's only job in this system is to pick one item from a list we wrote.
//
// It never composes text a beneficiary reads. Everything a person sees comes from
// modules/guide/guide.content.js, which is reviewed in version control — because a
// confidently wrong sentence about permit procedure can cost someone their status, and
// the people asking are the least able to catch the error.
//
// Everything below exists to keep that boundary: temperature 0, a tiny token ceiling, a
// short timeout, and a caller that rejects any answer outside the allowlist it supplied.
// This is config/openai.js's contract, kept identically, against Google instead.

const CONFIGURED = Boolean(env.GEMINI_API_KEY);

// A classification is one short word. Anything longer means the model is explaining
// itself, which is not what it was asked for.
export const MAX_OUTPUT_TOKENS = 24;

// A person waiting on a help widget should not stare at a spinner. If the model is slow,
// the manual menu is a perfectly good answer.
export const REQUEST_TIMEOUT_MS = 6000;

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

if (!CONFIGURED) {
  logger.warn('GEMINI_API_KEY not set — free-text matching disabled, the guide falls back to its menu');
}

export function isGeminiConfigured() {
  return CONFIGURED;
}

/*
 * THE BACK-OFF, and it is the half of rate limiting that a self-imposed limit cannot do.
 *
 * `geminiLimiter` keeps us under Google's quota by guessing. This is what happens when the
 * guess was wrong: a 429 or a 503 means Google has already refused, and the worst possible
 * response is to keep calling — every subsequent request pays a round trip to be refused
 * again, holds a serverless invocation open while it waits, and on some quota types digs the
 * hole deeper. So a refusal opens a window during which this module does not call at all.
 *
 * RETRY-AFTER IS OBEYED WHERE GOOGLE SENDS ONE, because it knows when the quota resets and we
 * do not. Where it does not, thirty seconds is a deliberate compromise: long enough that a
 * per-minute quota has meaningfully drained, short enough that a transient 503 does not
 * disable free-text matching for the rest of somebody's visit.
 *
 * PER-INSTANCE AND IN MEMORY, like the limiter. A cold start clears it, which is acceptable
 * here — the cost of one wasted call is a menu, not money that cannot be recovered.
 */
const DEFAULT_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 5 * 60_000;

let cooldownUntil = 0;

/** Seconds from a Retry-After header, clamped. Absent, unparseable or absurd → the default. */
function cooldownFrom(response) {
  const header = response.headers.get('retry-after');
  const seconds = Number(header);

  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_COOLDOWN_MS;
  return Math.min(seconds * 1000, MAX_COOLDOWN_MS);
}

/**
 * Ask the model to choose one label from `allowed`.
 *
 * Returns the chosen label, or null. Null is a completely ordinary outcome — no key, a
 * timeout, an outage, or an answer that was not on the list — and every caller must have
 * a path that does not depend on this succeeding.
 *
 * @param {object}   args
 * @param {string}   args.instruction  what the choice means
 * @param {string[]} args.allowed      the only acceptable answers
 * @param {string}   args.input        the person's own words
 */
export async function classify({ instruction, allowed, input }) {
  if (!CONFIGURED) return null;

  // Imported lazily, inside the call, to keep this config module free of a module-load
  // dependency on a Mongoose model — config/ is imported by almost everything, and a cycle
  // through the model layer here would be very hard to unpick later.
  const budget = await import('../modules/ai/aiUsage.service.js');

  /*
   * The outbound limiter, imported the same lazy way and for a second reason on top of the
   * one above: config/ sits BELOW http/ in this codebase's layering, and a static import here
   * would point a foundation module at a layer built on top of it. Deferring it to call time
   * keeps the module graph pointing one way. The module is cached after the first call, so
   * this costs nothing per request.
   */
  const { geminiLimiter } = await import('../http/rateLimit.js');

  // The monthly ceiling. Returning null is the same answer this function gives on a timeout
  // or an outage, so every caller already has a path that does not depend on it — the guide
  // shows its menu and the WhatsApp bot asks the person to reply with a number.
  if (await budget.isOverBudget()) {
    await budget.recordBlockedCall({ model: env.GEMINI_MODEL });
    return null;
  }

  /*
   * Still inside a back-off Google asked for. Nothing is sent and the caller takes the menu.
   * Recorded as a blocked call so a month of these is visible beside the spend rather than
   * looking like a quiet drop in usage.
   */
  if (Date.now() < cooldownUntil) {
    await budget.recordBlockedCall({ model: env.GEMINI_MODEL });
    return null;
  }

  /*
   * Our own ceiling on the outbound call rate — see geminiLimiter in http/rateLimit.js. One
   * fixed key, because the bucket is the whole deployment's allowance rather than any
   * caller's: this is not about who is asking, it is about how often we are allowed to ask
   * Google. `allow` rather than `check` because being over it is not an error to raise, it is
   * the same "no answer" every other failure path here produces.
   */
  if (!geminiLimiter.allow('outbound')) {
    await budget.recordBlockedCall({ model: env.GEMINI_MODEL });
    return null;
  }

  /*
   * fetch has no timeout of its own, so the deadline is an AbortController. Without it a
   * hung connection holds the request open until the platform kills the invocation, and the
   * person waiting on the widget gets nothing at all rather than the menu.
   */
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${ENDPOINT}/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          // A header, never the ?key= query parameter Google's quickstarts use: a key in a
          // URL lands in access logs and proxy logs, and this one bills a nonprofit.
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  `${instruction}\n\n` +
                  `Reply with EXACTLY ONE of these values and nothing else:\n${allowed.join('\n')}\n\n` +
                  `If none of them clearly fits, reply with: NONE\n` +
                  `Do not explain. Do not add punctuation. Do not answer the question yourself.`,
              },
            ],
          },
          contents: [{ role: 'user', parts: [{ text: input }] }],
          generationConfig: {
            // Deterministic: the same question must not route two people differently.
            temperature: 0,
            candidateCount: 1,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            /*
             * THINKING OFF, AND THIS IS LOAD-BEARING RATHER THAN A TUNING PREFERENCE.
             *
             * Gemini 2.5 models reason before they answer, and those reasoning tokens are
             * drawn from the SAME budget as the reply. With maxOutputTokens at 24 the model
             * can spend the entire allowance thinking and return finishReason MAX_TOKENS
             * with no text at all — which this function would read as a failed
             * classification and answer with the menu, every single time, while still being
             * billed for every call. A budget of 0 turns it off, which is correct here
             * anyway: choosing one label off a ten-item list is not a reasoning task.
             */
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!response.ok) {
      /*
       * 429 is quota and 503 is overload, and both mean the same thing operationally: stop
       * calling for a while. Everything else — a 400 from a malformed body, a 403 from a
       * revoked key — is a bug or a configuration fault that retrying cannot fix, and opening
       * a cooldown for it would only hide it.
       */
      if (response.status === 429 || response.status === 503) {
        const wait = cooldownFrom(response);
        cooldownUntil = Date.now() + wait;
        logger.warn(
          { status: response.status, cooldownMs: wait },
          'Gemini refused on quota — pausing outbound calls'
        );
      } else {
        // The body can echo the prompt back, and the prompt carries the person's own words.
        // Status only.
        logger.error(
          { status: response.status },
          'intent classification failed — falling back to the menu'
        );
      }

      return null;
    }

    const payload = await response.json();

    // Recorded before the answer is judged: a reply that fails the allowlist still cost
    // money, and a month of rejected classifications must show up in the total.
    //
    // `thoughtsTokenCount` is added to the output side because Google bills it as output.
    // It should be 0 with thinking disabled, and counting it anyway means a future change
    // to thinkingBudget cannot quietly under-report the bill.
    const usage = payload.usageMetadata ?? {};
    await budget.recordUsage({
      model: payload.modelVersion ?? env.GEMINI_MODEL,
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    });

    const answer = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    // The allowlist is the actual control. A model that returns anything else — including
    // a helpful-sounding sentence — is treated as having failed to classify.
    if (!answer || !allowed.includes(answer)) return null;
    return answer;
  } catch (err) {
    // Deliberately no `input` in the log: it is the person's own words and can describe
    // violence, illness or immigration status. An abort lands here too, which is the
    // intended path — a slow model and a broken one deserve the same answer.
    logger.error({ err }, 'intent classification failed — falling back to the menu');
    return null;
  } finally {
    clearTimeout(deadline);
  }
}
