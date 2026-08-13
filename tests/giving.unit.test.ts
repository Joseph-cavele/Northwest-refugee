import { describe, expect, it } from 'vitest';
import {
  countsTowardsTotals,
  describeCampaign,
  describeDonation,
} from '@/features/fundraising/lib/giving';

/*
 * Fundraising arithmetic and the receipt gap.
 *
 * Both rules under test fail silently. A campaign bar counting pending gifts looks
 * healthier than the bank account, and a donor missing their s18A certificate finds out in
 * February when they file — neither shows up as an error anywhere.
 */

describe('describeDonation', () => {
  it('does not treat a pending gift as money', () => {
    // A gateway's promise, not funds. COUNTS_TOWARDS_TOTALS on the server is ['SETTLED'].
    expect(describeDonation({ status: 'PENDING', receiptEmailedAt: null })).toEqual({
      kind: 'PENDING',
    });
    expect(countsTowardsTotals('PENDING')).toBe(false);
  });

  it('counts only settled donations towards totals', () => {
    expect(countsTowardsTotals('SETTLED')).toBe(true);
    for (const status of ['PENDING', 'FAILED', 'REFUNDED']) {
      expect(countsTowardsTotals(status)).toBe(false);
    }
  });

  it('flags a settled donation whose receipt never went out', () => {
    // The whole reason this module exists. Settling does not imply sending: the send is
    // best-effort so a mail outage cannot undo banked money.
    expect(describeDonation({ status: 'SETTLED', receiptEmailedAt: null })).toEqual({
      kind: 'RECEIPT_OWED',
    });
  });

  it('reports a settled donation whose receipt was delivered', () => {
    expect(
      describeDonation({ status: 'SETTLED', receiptEmailedAt: '2026-07-02T09:00:00Z' })
    ).toEqual({ kind: 'RECEIPTED', sentAt: '2026-07-02T09:00:00Z' });
  });

  it('never claims a receipt is owed on money that is not settled', () => {
    // A failed or refunded gift has no certificate due, whatever the receipt field says.
    expect(describeDonation({ status: 'REFUNDED', receiptEmailedAt: null })).toEqual({
      kind: 'REFUNDED',
    });
    expect(describeDonation({ status: 'FAILED', receiptEmailedAt: null })).toEqual({
      kind: 'FAILED',
    });
  });
});

describe('describeCampaign', () => {
  it('treats no target as no target, not as zero progress', () => {
    // The server's progressPercent virtual returns null for exactly this reason.
    expect(describeCampaign({ raisedCents: 250_000, targetCents: 0 })).toEqual({
      kind: 'NO_TARGET',
      raisedCents: 250_000,
    });
  });

  it('reports what is still needed while raising', () => {
    expect(describeCampaign({ raisedCents: 300_000, targetCents: 1_000_000 })).toEqual({
      kind: 'RAISING',
      raisedCents: 300_000,
      targetCents: 1_000_000,
      percent: 30,
      remainingCents: 700_000,
    });
  });

  it('distinguishes reaching the target exactly from passing it', () => {
    expect(describeCampaign({ raisedCents: 1_000_000, targetCents: 1_000_000 })).toMatchObject({
      kind: 'REACHED',
      percent: 100,
    });
    expect(describeCampaign({ raisedCents: 1_000_001, targetCents: 1_000_000 })).toMatchObject({
      kind: 'EXCEEDED',
    });
  });

  it('does not clamp a campaign that beat its target', () => {
    // The best news the screen has. Pinning it at 100% throws it away.
    expect(describeCampaign({ raisedCents: 1_400_000, targetCents: 1_000_000 })).toEqual({
      kind: 'EXCEEDED',
      raisedCents: 1_400_000,
      targetCents: 1_000_000,
      percent: 140,
      overCents: 400_000,
    });
  });

  it('treats a missing or negative raised figure as nothing raised', () => {
    expect(describeCampaign({ raisedCents: Number.NaN, targetCents: 500_000 })).toMatchObject({
      raisedCents: 0,
      percent: 0,
    });
    expect(describeCampaign({ raisedCents: -100, targetCents: 500_000 })).toMatchObject({
      raisedCents: 0,
    });
  });
});
