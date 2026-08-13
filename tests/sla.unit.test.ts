import { describe, expect, it } from 'vitest';
import { describeSla } from '@/features/serviceRequests/lib/sla';

/*
 * The SLA clock.
 *
 * The rule under test that is easiest to get wrong, and worst to get wrong, is the terminal
 * one: a request finished after its deadline must read as done, not as overdue. Get that
 * backwards and every completed queue fills with red nobody can act on, which is how the
 * genuinely overdue rows stop being noticed.
 */

// Midday SAST on 12 August 2026 — away from midnight, so a broken implementation cannot
// pass by rounding the lucky way on this particular day.
const NOW = Date.parse('2026-08-12T10:00:00Z');
const open = { isTerminal: false, now: NOW };

describe('describeSla', () => {
  it('reports a future deadline in whole calendar days', () => {
    expect(describeSla({ dueAt: '2026-08-19T00:00:00Z', ...open })).toEqual({
      kind: 'DUE',
      days: 7,
    });
  });

  it('treats the due date itself as still on time', () => {
    // The day has not run out. Calling it overdue at 10am makes the queue lie for a day.
    expect(describeSla({ dueAt: '2026-08-12T00:00:00Z', ...open })).toEqual({ kind: 'DUE_TODAY' });
  });

  it('reports yesterday as one day overdue', () => {
    expect(describeSla({ dueAt: '2026-08-11T00:00:00Z', ...open })).toEqual({
      kind: 'OVERDUE',
      days: 1,
    });
  });

  it('never calls a finished request overdue, however late it was', () => {
    // The work is done; the clock stopped when it was.
    const resolvedLate = describeSla({
      dueAt: '2026-01-01T00:00:00Z',
      isTerminal: true,
      now: NOW,
    });
    expect(resolvedLate).toEqual({ kind: 'DONE' });
  });

  it('reports DONE even when the server still flags it overdue', () => {
    // Belt and braces: terminal wins over the flag, so a stale virtual cannot paint a
    // completed row red.
    const standing = describeSla({
      dueAt: '2026-01-01T00:00:00Z',
      isTerminal: true,
      serverSaysOverdue: true,
      now: NOW,
    });
    expect(standing).toEqual({ kind: 'DONE' });
  });

  it('trusts the server when it says an open request is overdue', () => {
    const standing = describeSla({
      dueAt: '2026-12-01T00:00:00Z',
      isTerminal: false,
      serverSaysOverdue: true,
      now: NOW,
    });
    expect(standing.kind).toBe('OVERDUE');
  });

  it('reports NONE for an open request with no due date', () => {
    expect(describeSla({ dueAt: null, ...open })).toEqual({ kind: 'NONE' });
  });

  it('counts the day boundary in SAST, not UTC', () => {
    // 23:30 SAST on the 12th is 21:30 UTC. A UTC-based count is already into the 13th for
    // part of the SAST evening and would answer "due today" for a deadline of the 13th.
    const lateEvening = Date.parse('2026-08-12T21:30:00Z');
    expect(
      describeSla({ dueAt: '2026-08-13T00:00:00Z', isTerminal: false, now: lateEvening })
    ).toEqual({ kind: 'DUE', days: 1 });
  });

  it('matches the SLA table the server derives due dates from', () => {
    // URGENT 1 · HIGH 3 · NORMAL 7 · LOW 14, from config/constants.js. A request raised
    // today at each urgency should read as exactly that many days out.
    const day = 86_400_000;
    for (const days of [1, 3, 7, 14]) {
      const dueAt = new Date(NOW + days * day).toISOString();
      expect(describeSla({ dueAt, ...open })).toEqual({ kind: 'DUE', days });
    }
  });
});
