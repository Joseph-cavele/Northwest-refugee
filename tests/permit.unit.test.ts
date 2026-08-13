import { describe, expect, it } from 'vitest';
import { describePermit, EXPIRY_HORIZON_DAYS } from '@/features/beneficiaries/lib/permit';

/*
 * The permit countdown.
 *
 * Worth its own suite because every wrong answer here is quiet: the page renders, the
 * number looks reasonable, and a caseworker acts on it. The boundaries below are the ones
 * that decide whether someone is told to renew today or next month.
 */

// Midday SAST on 12 August 2026. Midday on purpose: a time near midnight would pass a
// broken implementation that happens to round the right way on that particular day.
const NOW = Date.parse('2026-08-12T10:00:00Z');

describe('describePermit', () => {
  it('reports NONE when no expiry date is recorded', () => {
    // Undocumented is a large share of the people NWHR serves — absence is a legitimate
    // state, and must never surface as an error or an expired permit.
    // `elapsed` is null rather than absent so callers can read it without narrowing first.
    expect(describePermit({ expiresAt: null, now: NOW })).toEqual({ kind: 'NONE', elapsed: null });
  });

  it('counts a future expiry in whole calendar days', () => {
    const standing = describePermit({ expiresAt: '2026-08-24T00:00:00Z', now: NOW });
    expect(standing).toMatchObject({ kind: 'EXPIRING', days: 12 });
  });

  it('treats an expiry today as still valid, not expired', () => {
    // The permit is good until the day ends. Calling it expired sends someone away who
    // could still have been helped.
    const standing = describePermit({ expiresAt: '2026-08-12T00:00:00Z', now: NOW });
    expect(standing).toMatchObject({ kind: 'EXPIRING', days: 0 });
  });

  it('reports yesterday as expired by one day', () => {
    const standing = describePermit({ expiresAt: '2026-08-11T00:00:00Z', now: NOW });
    expect(standing).toMatchObject({ kind: 'EXPIRED', days: 1 });
  });

  it('flags at exactly the horizon the expiry job works to', () => {
    const atHorizon = describePermit({ expiresAt: '2026-09-11T00:00:00Z', now: NOW });
    const dayBeyond = describePermit({ expiresAt: '2026-09-12T00:00:00Z', now: NOW });

    expect(atHorizon).toMatchObject({ kind: 'EXPIRING', days: EXPIRY_HORIZON_DAYS });
    expect(dayBeyond).toMatchObject({ kind: 'VALID', days: EXPIRY_HORIZON_DAYS + 1 });
  });

  it('counts the day boundary in SAST, not UTC', () => {
    /*
     * 23:30 SAST on the 12th is 21:30 UTC on the 12th, so this is a same-day check either
     * way; the trap is the other direction. A permit expiring on the 13th must read as one
     * day away at 23:30 SAST — a UTC-based count would already be into the 13th for part
     * of the SAST evening and answer zero.
     */
    const lateEvening = Date.parse('2026-08-12T21:30:00Z');
    expect(describePermit({ expiresAt: '2026-08-13T00:00:00Z', now: lateEvening })).toMatchObject({
      days: 1,
    });
  });

  it('trusts the server when it says a permit has expired', () => {
    // The server compared against its own clock. A laptop with a wrong date must not be
    // able to make an expired permit look valid.
    const standing = describePermit({
      expiresAt: '2027-01-01T00:00:00Z',
      now: NOW,
      serverSaysExpired: true,
    });
    expect(standing.kind).toBe('EXPIRED');
  });

  describe('the elapsed fraction the timeline is drawn from', () => {
    it('is the share of the permit life already used', () => {
      // Issued 100 days before expiry, 40 days in.
      const standing = describePermit({
        issuedAt: '2026-07-03T00:00:00Z',
        expiresAt: '2026-10-11T00:00:00Z',
        now: NOW,
      });
      expect(standing.elapsed).toBeCloseTo(40 / 100, 5);
    });

    it('is null without an issue date, rather than a guess', () => {
      // A bar drawn without a start date invents the geometry it appears to measure.
      const standing = describePermit({ expiresAt: '2026-10-11T00:00:00Z', now: NOW });
      expect(standing.elapsed).toBeNull();
    });

    it('is null when issue and expiry are the same day or inverted', () => {
      const sameDay = describePermit({
        issuedAt: '2026-10-11T00:00:00Z',
        expiresAt: '2026-10-11T00:00:00Z',
        now: NOW,
      });
      const inverted = describePermit({
        issuedAt: '2026-12-01T00:00:00Z',
        expiresAt: '2026-10-11T00:00:00Z',
        now: NOW,
      });

      expect(sameDay.elapsed).toBeNull();
      expect(inverted.elapsed).toBeNull();
    });

    it('never leaves the track, even for a permit issued after today', () => {
      const notYetStarted = describePermit({
        issuedAt: '2026-09-01T00:00:00Z',
        expiresAt: '2026-12-01T00:00:00Z',
        now: NOW,
      });
      expect(notYetStarted.elapsed).toBe(0);
    });

    it('is full for an expired permit', () => {
      const standing = describePermit({
        issuedAt: '2025-01-01T00:00:00Z',
        expiresAt: '2026-08-01T00:00:00Z',
        now: NOW,
      });
      expect(standing).toMatchObject({ kind: 'EXPIRED', elapsed: 1 });
    });
  });
});
