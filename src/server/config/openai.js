import OpenAI from 'openai';
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

const CONFIGURED = Boolean(env.OPENAI_API_KEY);

// A classification is one short word. Anything longer means the model is explaining
// itself, which is not what it was asked for.
export const MAX_OUTPUT_TOKENS = 24;

// A person waiting on a help widget should not stare at a spinner. If the model is slow,
// the manual menu is a perfectly good answer.
export const REQUEST_TIMEOUT_MS = 6000;

const client = CONFIGURED
  ? new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 })
  : null;

if (!CONFIGURED) {
  logger.warn('OPENAI_API_KEY not set — free-text matching disabled, the guide falls back to its menu');
}

export function isOpenAIConfigured() {
  return CONFIGURED;
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
  if (!client) return null;

  // Imported lazily, inside the call, to keep this config module free of a module-load
  // dependency on a Mongoose model — config/ is imported by almost everything, and a cycle
  // through the model layer here would be very hard to unpick later.
  const budget = await import('../modules/ai/aiUsage.service.js');

  // The monthly ceiling. Returning null is the same answer this function gives on a timeout
  // or an outage, so every caller already has a path that does not depend on it — the guide
  // shows its menu and the WhatsApp bot asks the person to reply with a number.
  if (await budget.isOverBudget()) {
    await budget.recordBlockedCall({ model: env.OPENAI_MODEL });
    return null;
  }

  try {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      // Deterministic: the same question must not route two people differently.
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        {
          role: 'system',
          content:
            `${instruction}\n\n` +
            `Reply with EXACTLY ONE of these values and nothing else:\n${allowed.join('\n')}\n\n` +
            `If none of them clearly fits, reply with: NONE\n` +
            `Do not explain. Do not add punctuation. Do not answer the question yourself.`,
        },
        { role: 'user', content: input },
      ],
    });

    // Recorded before the answer is judged: a reply that fails the allowlist still cost
    // money, and a month of rejected classifications must show up in the total.
    await budget.recordUsage({
      model: completion.model ?? env.OPENAI_MODEL,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    });

    const answer = completion.choices?.[0]?.message?.content?.trim();

    // The allowlist is the actual control. A model that returns anything else — including
    // a helpful-sounding sentence — is treated as having failed to classify.
    if (!answer || !allowed.includes(answer)) return null;
    return answer;
  } catch (err) {
    // Deliberately no `input` in the log: it is the person's own words and can describe
    // violence, illness or immigration status.
    logger.error({ err }, 'intent classification failed — falling back to the menu');
    return null;
  }
}

export default client;
