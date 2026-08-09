import { describe, it, expect, vi, beforeEach } from 'vitest';

// The jobs are the one part of this system nobody watches run: they fire at 07:00 with no
// request, no response and no user to notice that nothing happened. Every collaborator is
// mocked here so the scheduling rules themselves — which day a reminder goes out, who is
// told what — are exercised without a database.

vi.mock('../src/modules/beneficiaries/beneficiary.service.js', () => ({
  findExpiringPermits: vi.fn(),
}));
vi.mock('../src/modules/whatsapp/whatsapp.client.js', () => ({
  isWhatsAppConfigured: vi.fn(() => true),
  sendMessage: vi.fn(async () => true),
}));
vi.mock('../src/modules/notifications/notification.service.js', () => ({
  notify: vi.fn(async () => ({})),
  notifyPermission: vi.fn(async () => []),
}));
vi.mock('../src/modules/serviceRequests/serviceRequest.service.js', () => ({
  findOverdue: vi.fn(async () => []),
}));
vi.mock('../src/modules/cases/case.service.js', () => ({
  findEscalated: vi.fn(async () => []),
}));
vi.mock('../src/modules/referrals/referral.service.js', () => ({
  findAwaitingFollowUp: vi.fn(async () => []),
}));
vi.mock('../src/modules/finance/finance.service.js', () => ({
  findBudgetLinesNearLimit: vi.fn(async () => []),
  findStaleApprovals: vi.fn(async () => []),
  findUnreconciledFloats: vi.fn(async () => []),
}));
// The rollup stores the closed day's metrics on its way out. Mocked like every other
// collaborator: unmocked it is the one call here that would really reach Mongo, and with
// no connection each rollup test would sit through the driver's buffering timeout before
// the job swallowed the error.
vi.mock('../src/modules/reports/report.service.js', () => ({
  snapshotDailyMetrics: vi.fn(async () => ({ date: new Date(), metrics: 0, written: 0 })),
}));

const { findExpiringPermits } = await import('../src/modules/beneficiaries/beneficiary.service.js');
const { isWhatsAppConfigured, sendMessage } = await import('../src/modules/whatsapp/whatsapp.client.js');
const { notify, notifyPermission } = await import('../src/modules/notifications/notification.service.js');
const { findOverdue } = await import('../src/modules/serviceRequests/serviceRequest.service.js');
const { findEscalated } = await import('../src/modules/cases/case.service.js');
const { findAwaitingFollowUp } = await import('../src/modules/referrals/referral.service.js');
const finance = await import('../src/modules/finance/finance.service.js');
const { snapshotDailyMetrics } = await import('../src/modules/reports/report.service.js');

const { runPermitExpiry } = await import('../src/jobs/permitExpiry.job.js');
const { runDailyRollup } = await import('../src/jobs/dailyRollup.job.js');
const { runFinanceAlerts } = await import('../src/jobs/financeAlerts.job.js');
const { startJobs, stopJobs } = await import('../src/jobs/index.js');

// clearAllMocks() clears the call log but keeps implementations, so every finder is reset
// to "nothing found" here. Without it one test's fixture is still returned in the next,
// and a job that should have been silent fires first in the call log.
beforeEach(() => {
  vi.clearAllMocks();
  isWhatsAppConfigured.mockReturnValue(true);
  sendMessage.mockResolvedValue(true);

  findExpiringPermits.mockResolvedValue([]);
  findOverdue.mockResolvedValue([]);
  findEscalated.mockResolvedValue([]);
  findAwaitingFollowUp.mockResolvedValue([]);
  finance.findBudgetLinesNearLimit.mockResolvedValue([]);
  finance.findStaleApprovals.mockResolvedValue([]);
  finance.findUnreconciledFloats.mockResolvedValue([]);
  snapshotDailyMetrics.mockResolvedValue({ date: new Date(), metrics: 20, written: 20 });
});

const person = (overrides = {}) => ({
  id: 'x',
  referenceCode: 'NWHR-2026-ABC123',
  cellphone: '+27821234567',
  language: 'en',
  expiresAt: new Date(),
  daysRemaining: 14,
  ...overrides,
});

describe('the scheduler', () => {
  it('schedules all three jobs with valid expressions', () => {
    expect(startJobs()).toBe(3);
    stopJobs();
  });
});

describe('permit expiry', () => {
  it('does nothing when no permit is close to expiring', async () => {
    findExpiringPermits.mockResolvedValue([]);
    expect(await runPermitExpiry()).toMatchObject({ checked: 0, messaged: 0 });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(notifyPermission).not.toHaveBeenCalled();
  });

  it('messages only on the reminder days, so a daily run cannot nag', async () => {
    findExpiringPermits.mockResolvedValue([
      person({ daysRemaining: 30 }),
      person({ daysRemaining: 29 }), // between thresholds — silence
      person({ daysRemaining: 14 }),
      person({ daysRemaining: 13 }),
      person({ daysRemaining: 7 }),
      person({ daysRemaining: 4 }),
      person({ daysRemaining: 1 }),
      person({ daysRemaining: 0 }), // lapsed today
      person({ daysRemaining: -9 }), // lapsed a while ago — told once, on the day
    ]);

    const summary = await runPermitExpiry();
    expect(summary.checked).toBe(9);
    expect(summary.messaged).toBe(5);
    expect(sendMessage).toHaveBeenCalledTimes(5);
  });

  it('skips anyone with no cellphone rather than throwing', async () => {
    findExpiringPermits.mockResolvedValue([
      person({ cellphone: undefined }),
      person({ cellphone: null }),
    ]);
    const summary = await runPermitExpiry();
    expect(summary.messaged).toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
    // The office is still told: the reminders not going out is the office's problem to fix.
    expect(notifyPermission).toHaveBeenCalledTimes(1);
  });

  it('still tells the office when WhatsApp is not configured', async () => {
    isWhatsAppConfigured.mockReturnValue(false);
    findExpiringPermits.mockResolvedValue([person({ daysRemaining: 7 })]);

    const summary = await runPermitExpiry();
    expect(summary.messaged).toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(notifyPermission).toHaveBeenCalledTimes(1);
  });

  it('counts a failed send instead of losing it', async () => {
    sendMessage.mockResolvedValue(false);
    findExpiringPermits.mockResolvedValue([person({ daysRemaining: 7 })]);
    expect(await runPermitExpiry()).toMatchObject({ messaged: 0, failed: 1 });
  });

  it('raises the digest to HIGH once a permit has actually lapsed, and names nobody', async () => {
    findExpiringPermits.mockResolvedValue([person({ daysRemaining: -3 }), person({ daysRemaining: 20 })]);
    await runPermitExpiry();

    const [, payload] = notifyPermission.mock.calls[0];
    expect(payload.priority).toBe('HIGH');
    expect(payload.type).toBe('SYSTEM');
    expect(payload.message).toMatch(/1 already lapsed/);
    expect(payload.message).not.toMatch(/NWHR-2026/);
    expect(payload.message).not.toMatch(/\+27/);
  });
});

describe('daily rollup', () => {
  it('says nothing when nothing is slipping', async () => {
    expect(await runDailyRollup()).toMatchObject({ overdueRequests: 0, notified: 0 });
    expect(notify).not.toHaveBeenCalled();
    expect(notifyPermission).not.toHaveBeenCalled();
  });

  it('addresses each owner once for everything on their desk', async () => {
    findOverdue.mockResolvedValue([{ assignedTo: 'officer-1' }, { assignedTo: 'officer-1' }]);
    findEscalated.mockResolvedValue([{ caseworker: 'officer-1' }, { caseworker: 'officer-2' }]);
    findAwaitingFollowUp.mockResolvedValue([{ referredBy: 'officer-2' }]);

    const summary = await runDailyRollup();
    expect(summary.notified).toBe(2);
    expect(notify).toHaveBeenCalledTimes(2);

    const first = notify.mock.calls.find(([p]) => p.userId === 'officer-1')[0];
    expect(first.message).toBe('2 requests past due · 1 urgent case still open.');
    // An urgent case outranks a queue of routine work.
    expect(first.priority).toBe('HIGH');

    const second = notify.mock.calls.find(([p]) => p.userId === 'officer-2')[0];
    expect(second.message).toBe('1 urgent case still open · 1 referral to chase.');
  });

  it('sends unowned overdue work to whoever can assign it', async () => {
    findOverdue.mockResolvedValue([{ assignedTo: null }, { assignedTo: undefined }, { assignedTo: 'officer-1' }]);

    const summary = await runDailyRollup();
    expect(summary.unassignedRequests).toBe(2);
    expect(notify).toHaveBeenCalledTimes(1); // officer-1 only

    const [permission, payload] = notifyPermission.mock.calls[0];
    expect(permission).toBe('service_request:update');
    expect(payload.priority).toBe('HIGH');
    expect(payload.message).toMatch(/2 overdue requests are unassigned/);
  });

  it('snapshots the day that closed, not the one that just started', async () => {
    await runDailyRollup();

    // The job fires at 00:30, so the only whole day available is yesterday. Snapshotting
    // "today" half an hour in would store a day's figures against thirty minutes of it.
    const [{ date }] = snapshotDailyMetrics.mock.calls[0];
    const hoursBack = (Date.now() - date.getTime()) / 3_600_000;
    expect(hoursBack).toBeGreaterThan(23);
    expect(hoursBack).toBeLessThan(25);
  });

  it('still delivers the rollup when the metrics snapshot fails', async () => {
    findOverdue.mockResolvedValue([{ assignedTo: 'officer-1' }]);
    snapshotDailyMetrics.mockRejectedValue(new Error('mongo unavailable'));

    // A gap in a metrics table is a gap in a report; a rollup nobody received is work
    // nobody was told about. The notifications have already gone out by this point.
    await expect(runDailyRollup()).resolves.toMatchObject({ notified: 1 });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe('finance alerts', () => {
  const line = (overrides = {}) => ({
    reference: 'BUD-2026-AAAAAA', code: 'ADM01', usedPercent: 92, ...overrides,
  });

  it('is silent in a clean week — an alert that always fires is one nobody reads', async () => {
    expect(await runFinanceAlerts()).toMatchObject({
      budgetLinesNearLimit: 0, staleApprovals: 0, unreconciledFloats: 0,
    });
    expect(notifyPermission).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('separates a line running low from one already overspent', async () => {
    finance.findBudgetLinesNearLimit.mockResolvedValue([line({ usedPercent: 94 })]);
    await runFinanceAlerts();
    let [permission, payload] = notifyPermission.mock.calls[0];
    expect(permission).toBe('budget:read');
    expect(payload.title).toMatch(/nearly spent/);
    expect(payload.priority).toBeUndefined();

    notifyPermission.mockClear();
    finance.findBudgetLinesNearLimit.mockResolvedValue([line({ usedPercent: 118 }), line()]);
    await runFinanceAlerts();
    [, payload] = notifyPermission.mock.calls[0];
    expect(payload.title).toMatch(/overspent/);
    expect(payload.priority).toBe('HIGH');
    expect(payload.message).toMatch(/1 over/);
  });

  it('tells the approvers how long the oldest transaction has waited', async () => {
    finance.findStaleApprovals.mockResolvedValue([
      {
        reference: 'TXN-2026-BBBBBB',
        amountCents: 750_00,
        submittedAt: new Date(Date.now() - 5 * 86_400_000),
      },
    ]);

    await runFinanceAlerts();
    const [permission, payload] = notifyPermission.mock.calls[0];
    expect(permission).toBe('transaction:approve');
    // en-ZA: a comma decimal separator, not a point. The message quotes what a South
    // African finance officer would read on a bank statement.
    expect(payload.message).toMatch(/750,00/);
    expect(payload.message).toMatch(/waiting 5 days/);
  });

  it('tells the custodian too, because they may not count their own float', async () => {
    finance.findUnreconciledFloats.mockResolvedValue([
      {
        reference: 'PCF-2026-CCCCCC', name: 'Front desk', custodian: 'officer-9',
        balanceCents: 1_250_00, lastReconciledAt: null,
      },
    ]);

    await runFinanceAlerts();

    const [permission, digest] = notifyPermission.mock.calls[0];
    expect(permission).toBe('petty_cash:reconcile');
    expect(digest.message).toMatch(/1 never counted/);
    expect(digest.priority).toBe('HIGH');

    const [own] = notify.mock.calls[0];
    expect(own.userId).toBe('officer-9');
    expect(own.message).toMatch(/has never been counted/);
    expect(own.message).toMatch(/may not count your own float/);
  });
});
