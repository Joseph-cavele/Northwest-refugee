import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, expectSuccess, expectError,
} from './helpers.js';
import env from '../src/config/env.js';
import AiUsage from '../src/modules/ai/aiUsage.model.js';
import Notification from '../src/modules/notifications/notification.model.js';
import * as usage from '../src/modules/ai/aiUsage.service.js';

const hasDb = await connect();
const base = '/api/v1/ai';

describe.runIf(hasDb)('AI spend ceiling', () => {
  const MODEL = 'gpt-4o-mini';
  let budget;

  beforeAll(async () => {
    await resetDatabase();
  });
  afterAll(disconnect);

  beforeEach(async () => {
    await resetDatabase();
    budget = env.OPENAI_MONTHLY_BUDGET_ZAR;
    usage.resetBudgetCache();
  });

  afterEach(() => {
    env.OPENAI_MONTHLY_BUDGET_ZAR = budget;
    usage.resetBudgetCache();
  });

  // Enough gpt-4o-mini output tokens to pass R300 at the configured rate — the cheap model
  // is cheap, so the ceiling is a large number of tokens rather than a handful.
  const tokensWorth = (rands) =>
    Math.ceil((rands / (env.OPENAI_USD_ZAR_RATE * (0.6 / 1_000_000))) * 1.0);

  it('prices tokens into rands', () => {
    // 1M output tokens of gpt-4o-mini is $0.60, which at the configured rate is 0.60 * rate.
    const cents = usage.costInCents({ model: MODEL, outputTokens: 1_000_000 });
    expect(cents).toBe(Math.round(0.6 * env.OPENAI_USD_ZAR_RATE * 100));
  });

  // OpenAI answers a request for 'gpt-4o-mini' with 'gpt-4o-mini-2024-07-18'. Both of the
  // following went wrong silently in a live run before normaliseModel() existed.
  it('prices a dated snapshot as the model it is', () => {
    const alias = usage.costInCents({ model: MODEL, inputTokens: 109, outputTokens: 3 });
    const snapshot = usage.costInCents({
      model: 'gpt-4o-mini-2024-07-18', inputTokens: 109, outputTokens: 3,
    });
    expect(snapshot).toBe(alias);

    // ...and not at the pessimistic default, which over-charged this by about sixteen times.
    const unknown = usage.costInCents({
      model: 'mystery-model', inputTokens: 109, outputTokens: 3,
    });
    expect(usage.costInCents({ model: MODEL, inputTokens: 1_000_000 })).toBeLessThan(
      usage.costInCents({ model: 'mystery-model', inputTokens: 1_000_000 })
    );
    void unknown;
  });

  it('buckets a snapshot reply and a configured name into one row', async () => {
    // What a real call records...
    await usage.recordUsage({ model: 'gpt-4o-mini-2024-07-18', inputTokens: 100, outputTokens: 5 });
    // ...and what a blocked call records.
    await usage.recordBlockedCall({ model: MODEL });

    const rows = await AiUsage.find({});
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe(MODEL);
    expect(rows[0].calls).toBe(1);
    expect(rows[0].blockedCalls).toBe(1);
  });

  it('prices an unknown model pessimistically rather than as free', () => {
    const known = usage.costInCents({ model: MODEL, outputTokens: 1_000_000 });
    const unknown = usage.costInCents({ model: 'some-future-model', outputTokens: 1_000_000 });
    expect(unknown).toBeGreaterThan(known);
  });

  it('accumulates usage across calls', async () => {
    await usage.recordUsage({ model: MODEL, inputTokens: 100, outputTokens: 10 });
    await usage.recordUsage({ model: MODEL, inputTokens: 250, outputTokens: 20 });

    const spend = await usage.getSpend();
    expect(spend.inputTokens).toBe(350);
    expect(spend.outputTokens).toBe(30);
    expect(spend.calls).toBe(2);
  });

  it('is under budget on a fresh month', async () => {
    expect(await usage.isOverBudget()).toBe(false);
  });

  it('goes over budget once the ceiling is reached', async () => {
    await usage.recordUsage({ model: MODEL, outputTokens: tokensWorth(300) });
    usage.resetBudgetCache();

    expect(await usage.isOverBudget()).toBe(true);
    const spend = await usage.getSpend();
    expect(spend.exceeded).toBe(true);
    expect(spend.remainingCents).toBe(0);
  });

  it('treats a budget of zero as "never call the model"', async () => {
    env.OPENAI_MONTHLY_BUDGET_ZAR = 0;
    usage.resetBudgetCache();
    expect(await usage.isOverBudget()).toBe(true);
  });

  it('counts a blocked call and alerts the budget holders exactly once', async () => {
    const ed = await makeUser(ROLES.EXECUTIVE_DIRECTOR);
    const finance = await makeUser(ROLES.FINANCE_OFFICER);
    const volunteer = await makeUser(ROLES.VOLUNTEER);

    await usage.recordBlockedCall({ model: MODEL });
    await usage.recordBlockedCall({ model: MODEL });
    await usage.recordBlockedCall({ model: MODEL });

    const row = await AiUsage.findOne({ model: MODEL });
    expect(row.blockedCalls).toBe(3);
    expect(row.budgetExceededNotifiedAt).toBeTruthy();

    const alerts = await Notification.find({ type: 'SYSTEM' });
    const recipients = alerts.map((n) => String(n.userId));
    expect(recipients).toContain(String(ed.user._id));
    expect(recipients).toContain(String(finance.user._id));
    expect(recipients).not.toContain(String(volunteer.user._id));

    // Three blocked calls, one alert per person — not three.
    expect(alerts.filter((n) => String(n.userId) === String(ed.user._id))).toHaveLength(1);
    expect(alerts[0].title).toBe('AI Budget Reached');
  });

  it('buckets spend by calendar month in South African time', () => {
    // 00:30 on 1 August in Johannesburg is still 22:30 on 31 July in UTC. The call belongs
    // to August's budget, which is the month the person actually sent the message in.
    expect(usage.currentPeriod(new Date('2026-07-31T22:30:00Z'))).toBe('2026-08');
    expect(usage.currentPeriod(new Date('2026-07-15T12:00:00Z'))).toBe('2026-07');
  });

  it('keeps last month’s spend out of this month’s total', async () => {
    await AiUsage.create({ period: '2020-01', model: MODEL, outputTokens: tokensWorth(1000) });
    usage.resetBudgetCache();

    expect(await usage.isOverBudget()).toBe(false);
    expect((await usage.getSpend()).spentCents).toBe(0);
  });

  // --- the read surface -------------------------------------------------------------

  it('reports spend to someone who may see budgets', async () => {
    const finance = await makeUser(ROLES.FINANCE_OFFICER);
    await usage.recordUsage({ model: MODEL, inputTokens: 1000, outputTokens: 100 });

    const res = await request(app)
      .get(`${base}/spend`)
      .set('Authorization', `Bearer ${finance.token}`);

    const data = expectSuccess(res);
    expect(data.calls).toBe(1);
    expect(data.limit).toMatch(/300/);
    expect(data.exceeded).toBe(false);
  });

  it('refuses the spend figure to someone without budget:read', async () => {
    const volunteer = await makeUser(ROLES.VOLUNTEER);
    const res = await request(app)
      .get(`${base}/spend`)
      .set('Authorization', `Bearer ${volunteer.token}`);
    expectError(res, 403, 'FORBIDDEN');
  });

  it('rejects a malformed period', async () => {
    const finance = await makeUser(ROLES.FINANCE_OFFICER);
    const res = await request(app)
      .get(`${base}/spend?period=July`)
      .set('Authorization', `Bearer ${finance.token}`);
    expectError(res, 422, 'VALIDATION_FAILED');
  });
});
