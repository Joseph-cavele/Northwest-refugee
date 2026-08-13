import type { EventStatus } from '@/api/events.api';

/*
 * Planned attendance against actual.
 *
 * AN EVENT THAT HAS NOT HAPPENED HAS NOT UNDER-PERFORMED. This is the rule the whole module
 * exists for. `recordedAttendance` starts at zero and stays there until someone works the
 * register, so a naive expected-minus-recorded reads "250 short" against a dialogue that is
 * still three weeks away. That is not a shortfall, it is a future — and a screen that
 * reports it as a failure teaches people to ignore the ones that are real.
 *
 * NOTHING IS CLAMPED, unlike cohort seats. A cohort cannot exceed its capacity without
 * something having gone wrong; an event absolutely can exceed what was planned for, and
 * 300 people at a 200-person venue is a real and useful fact about the day. So the ratio
 * runs past 1 and OVER is an ordinary outcome rather than an integrity warning.
 */

export type Turnout =
  /** The event did not happen. There is no turnout to judge. */
  | { kind: 'CANCELLED' }
  /** Still ahead. Only the plan exists yet. */
  | { kind: 'UPCOMING'; expected: number }
  /** Held, but nobody set a target — the count stands on its own. */
  | { kind: 'NO_TARGET'; recorded: number }
  | { kind: 'SHORT'; recorded: number; expected: number; by: number; ratio: number }
  | { kind: 'MET'; recorded: number; expected: number; ratio: number }
  | { kind: 'OVER'; recorded: number; expected: number; by: number; ratio: number };

export function describeTurnout({
  recorded,
  expected,
  status,
  isPast,
}: {
  recorded: number;
  expected: number;
  status: EventStatus;
  /** The server's `isPast` virtual. Null when there is no start date to compare. */
  isPast: boolean | null;
}): Turnout {
  if (status === 'CANCELLED') return { kind: 'CANCELLED' };

  const held = Number.isFinite(recorded) && recorded > 0 ? Math.floor(recorded) : 0;
  const target = Number.isFinite(expected) && expected > 0 ? Math.floor(expected) : 0;

  /*
   * COMPLETED wins over the clock. An event marked completed is finished whatever its
   * start date says — and the date can lag, because a register is often worked up the
   * following morning.
   */
  if (status !== 'COMPLETED' && isPast !== true) return { kind: 'UPCOMING', expected: target };

  if (target === 0) return { kind: 'NO_TARGET', recorded: held };

  const ratio = held / target;
  if (held < target) return { kind: 'SHORT', recorded: held, expected: target, by: target - held, ratio };
  if (held === target) return { kind: 'MET', recorded: held, expected: target, ratio };
  return { kind: 'OVER', recorded: held, expected: target, by: held - target, ratio };
}
