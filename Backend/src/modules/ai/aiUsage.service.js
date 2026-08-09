import env from '../../config/env.js';
import { loggerFor } from '../../config/logger.js';
import { TIMEZONE } from '../../config/constants.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { toCents, formatZAR } from '../../utils/money.js';
import * as notifications from '../notifications/notification.service.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
import AiUsage from './aiUsage.model.js';

const log = loggerFor('aiUsage.service');

/**
 * USD per 1 000 000 tokens, by model. From OpenAI's published list prices.
 *
 * A model that is not listed falls back to UNKNOWN_MODEL_PRICING, which is deliberately
 * pessimistic: mispricing a model downwards would let spend run past the ceiling unnoticed,
 * which is the one outcome this whole file exists to prevent. Add a row when the configured
 * model changes.
 */
const PRICING_USD_PER_MILLION = Object.freeze({
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'gpt-4.1': { input: 2, output: 8 },
});

// Priced as the dearest model on the list, so an unrecognised name over-estimates rather
// than under-estimates the bill.
const UNKNOWN_MODEL_PRICING = Object.freeze({ input: 2.5, output: 10 });

/**
 * Strip the dated snapshot suffix OpenAI resolves an alias to.
 *
 * A request for 'gpt-4o-mini' comes back as 'gpt-4o-mini-2024-07-18'. Left alone that
 * breaks this file twice over, and both failures are silent:
 *
 *   - the snapshot name misses the pricing table and falls through to the pessimistic
 *     default, billing a cheap model at the dearest rate — about sixteen times over, so a
 *     R300 ceiling would stop the model at roughly R19 of genuine spend;
 *   - usage is recorded under the resolved name while a blocked call is recorded under the
 *     configured one, so a single month's activity splits across two rows and the
 *     send-the-alert-once claim sits on the row that never sees the blocked calls.
 *
 * Normalising on the way in makes both paths agree on one bucket.
 */
export function normaliseModel(model) {
  return String(model ?? '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
}

function pricingFor(model) {
  return PRICING_USD_PER_MILLION[normaliseModel(model)] ?? UNKNOWN_MODEL_PRICING;
}

/**
 * The current budget period, 'YYYY-MM' in South African local time.
 *
 * en-CA gives ISO-ordered parts, so slicing the first seven characters is the year and
 * month without any date maths — and doing it in TIMEZONE means a call at 01:00 on the
 * first of the month is billed to the month it happened in locally, not in UTC.
 */
export function currentPeriod(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .slice(0, 7);
}

/**
 * Token counts → rand cents.
 *
 * Floats appear here and nowhere else in the money path. That is deliberate and safe: the
 * STORED quantities are exact integer token counts, and this is a derivation performed
 * fresh on each read, never an accumulating balance. It returns integer cents so callers
 * stay on the system's normal money footing.
 */
export function costInCents({ model, inputTokens = 0, outputTokens = 0 }) {
  const price = pricingFor(model);
  const usd =
    (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  return toCents(usd * env.OPENAI_USD_ZAR_RATE);
}

export function budgetCents() {
  return toCents(env.OPENAI_MONTHLY_BUDGET_ZAR);
}

// --- the running total -------------------------------------------------------------

/**
 * Spend for a period, across every model used in it.
 *
 * Summed per model then added, because two models in the same month carry different rates
 * and a combined token count could not be priced correctly.
 */
export async function getSpend(period = currentPeriod()) {
  const rows = await AiUsage.find({ period }).lean();

  const spentCents = rows.reduce((total, row) => total + costInCents(row), 0);
  const limitCents = budgetCents();

  return {
    period,
    spentCents,
    limitCents,
    remainingCents: Math.max(0, limitCents - spentCents),
    spent: formatZAR(spentCents),
    limit: formatZAR(limitCents),
    remaining: formatZAR(Math.max(0, limitCents - spentCents)),
    exceeded: spentCents >= limitCents,
    calls: rows.reduce((n, row) => n + (row.calls ?? 0), 0),
    blockedCalls: rows.reduce((n, row) => n + (row.blockedCalls ?? 0), 0),
    inputTokens: rows.reduce((n, row) => n + (row.inputTokens ?? 0), 0),
    outputTokens: rows.reduce((n, row) => n + (row.outputTokens ?? 0), 0),
    models: rows.map((row) => ({
      model: row.model,
      calls: row.calls,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      spent: formatZAR(costInCents(row)),
    })),
  };
}

/**
 * A short-lived cache of "are we over budget", because this is consulted before EVERY
 * classification and a database round trip on each one would add latency to a person
 * waiting on a WhatsApp reply.
 *
 * Being a few seconds stale cannot overspend meaningfully: at the price of one
 * classification it would take many thousands of calls to move the total by a rand.
 */
const CACHE_TTL_MS = 15_000;
let cache = { checkedAt: 0, period: null, exceeded: false };

export function resetBudgetCache() {
  cache = { checkedAt: 0, period: null, exceeded: false };
}

/**
 * True when the model must not be called again this month.
 *
 * Fails OPEN on a database error — deliberately. The alternative is that a transient Mongo
 * blip silently disables free-text matching for everyone, and the ceiling is a cost control
 * rather than a safety one. The error is logged loudly instead.
 */
export async function isOverBudget() {
  const period = currentPeriod();

  // A budget of zero means "never call the model"; no lookup can change that answer.
  if (env.OPENAI_MONTHLY_BUDGET_ZAR === 0) return true;

  const fresh = cache.period === period && Date.now() - cache.checkedAt < CACHE_TTL_MS;
  if (fresh) return cache.exceeded;

  try {
    const { exceeded } = await getSpend(period);
    cache = { checkedAt: Date.now(), period, exceeded };
    return exceeded;
  } catch (err) {
    log.error({ err }, 'could not read AI spend — allowing the call');
    return false;
  }
}

// --- recording -----------------------------------------------------------------------

/**
 * Add one completed call to the month's total.
 *
 * Best-effort: a failure to record must not turn a successful classification into an error
 * for the person waiting on it. The consequence of a lost write is a slightly
 * under-counted month, not a broken conversation.
 */
export async function recordUsage({ model, inputTokens = 0, outputTokens = 0 }) {
  const period = currentPeriod();
  // Bucketed under the alias, so the reply's dated snapshot and the configured name are
  // the same row — see normaliseModel().
  const key = normaliseModel(model);

  try {
    await AiUsage.updateOne(
      { period, model: key },
      { $inc: { inputTokens, outputTokens, calls: 1 } },
      { upsert: true }
    );
    // The total moved, so the cached verdict may be stale in the one direction that matters.
    if (cache.period === period) cache.checkedAt = 0;
  } catch (err) {
    log.error({ err, model }, 'failed to record AI usage');
  }
}

/**
 * Record that a call was refused, and tell the people who watch the budget — once.
 *
 * The notification is claimed with a conditional update on `budgetExceededNotifiedAt: null`,
 * so of several instances hitting the ceiling in the same second exactly one sends it.
 */
export async function recordBlockedCall({ model }) {
  const period = currentPeriod();
  const key = normaliseModel(model);

  try {
    // `before` gives the row as it stood prior to this increment, which is what says
    // whether the alert has already gone out — and lets the common case (long after the
    // ceiling was hit) cost a single write instead of two.
    const previous = await AiUsage.findOneAndUpdate(
      { period, model: key },
      { $inc: { blockedCalls: 1 } },
      { upsert: true, returnDocument: 'before' }
    );
    if (previous?.budgetExceededNotifiedAt) return;

    // Conditional on still being null, so of several instances crossing the ceiling in the
    // same second exactly one sends the alert.
    const claimed = await AiUsage.findOneAndUpdate(
      { period, model: key, budgetExceededNotifiedAt: null },
      { $set: { budgetExceededNotifiedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!claimed) return;

    const spend = await getSpend(period);

    log.warn(
      { period, spentCents: spend.spentCents, limitCents: spend.limitCents },
      'AI monthly budget reached — classification is disabled until next month'
    );

    await audit.record({
      actor: null,
      action: ACTIONS.AI_BUDGET_EXCEEDED,
      status: 'failure',
      meta: { period, model: key, spentCents: spend.spentCents, limitCents: spend.limitCents },
    });

    await notifications.notifyPermission(PERMISSIONS.BUDGET_READ, {
      title: 'AI Budget Reached',
      message:
        `Free-text matching has used its ${spend.limit} allowance for ${period} and is now ` +
        'switched off. The WhatsApp bot and help guide still work — they fall back to their ' +
        'numbered menus. It resumes automatically next month.',
      type: 'SYSTEM',
      priority: 'HIGH',
    });
  } catch (err) {
    log.error({ err, model }, 'failed to record a blocked AI call');
  }
}
