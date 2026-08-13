import { daysUntil } from '@/lib/dates';

/*
 * Where a request stands against the time it was promised in.
 *
 * A DIFFERENT CLOCK FROM THE PERMIT ONE, and worth keeping separate. A permit expiry is an
 * external fact NWHR does not control; an SLA is a promise the organisation made to itself,
 * derived from urgency at creation (URGENT 1 day, HIGH 3, NORMAL 7, LOW 14). Missing one is
 * an internal failure, not a change in someone's legal status, and the wording differs
 * accordingly.
 *
 * THE TERMINAL RULE IS THE ONE THAT MATTERS HERE. A resolved, referred or cancelled request
 * is never overdue however long ago its due date passed — the work is done, and the clock
 * stopped when it was. Without that rule a queue of completed work slowly fills with red
 * that nobody can act on, and the real overdue rows stop standing out. The server agrees:
 * its `isOverdue` virtual returns false for any terminal status.
 */

export type SlaStanding =
  /** No due date, or the request is finished. Either way there is no clock to show. */
  | { kind: 'NONE' }
  /** Finished. Kept distinct from NONE so a row can say so rather than showing nothing. */
  | { kind: 'DONE' }
  | { kind: 'OVERDUE'; days: number }
  | { kind: 'DUE_TODAY' }
  | { kind: 'DUE'; days: number };

/**
 * @param isTerminal the server's `isTerminal` virtual — RESOLVED, REFERRED or CANCELLED.
 * @param serverSaysOverdue the server's `isOverdue` virtual. It beats the browser clock,
 *   for the same reason the permit band trusts `permitExpired`: a laptop with a wrong date
 *   must not be able to make a missed promise look kept.
 */
export function describeSla({
  dueAt,
  isTerminal,
  serverSaysOverdue = null,
  now,
}: {
  dueAt: string | null;
  isTerminal: boolean;
  serverSaysOverdue?: boolean | null;
  now: number;
}): SlaStanding {
  // Checked before the date, so a request resolved long after its deadline reads as done
  // rather than as the most urgent thing on the screen.
  if (isTerminal) return { kind: 'DONE' };
  if (!dueAt) return { kind: 'NONE' };

  const days = daysUntil(dueAt, now);
  if (days === null) return { kind: 'NONE' };

  if (serverSaysOverdue === true || days < 0) return { kind: 'OVERDUE', days: Math.abs(days) };
  // Due today is still on time — the day has not run out yet.
  if (days === 0) return { kind: 'DUE_TODAY' };
  return { kind: 'DUE', days };
}
