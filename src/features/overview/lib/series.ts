import type { MetricRow } from '@/api/reports.api';

/*
 * Turning the stored daily series into something a chart can draw.
 *
 * The rule everything here obeys: a STOCK is a level at a moment and must never be summed
 * across days; a FLOW is an amount over a period and must. The server sends `kind` on every
 * row precisely so this file does not have to guess, and every function below branches on
 * it rather than on the metric's name.
 */

export interface Point {
  date: string;
  value: number;
}

/** One key's rows, oldest first, as plain points. */
export function toPoints(rows: MetricRow[], key: string): Point[] {
  return rows
    .filter((row) => row.key === key && row.dimension === null)
    .map((row) => ({ date: row.date, value: row.value }));
}

export interface Delta {
  /** Signed change, in the metric's own unit. */
  change: number;
  /** Signed proportion, or null when the earlier figure was zero. */
  ratio: number | null;
  /** What it is being compared against, for the caption. */
  against: string;
}

/**
 * A real comparison, or nothing.
 *
 * THE HARD PART IS REFUSING. A dashboard's "+24% on last month" is the first thing a reader
 * believes and the last thing they check, so it may only appear when the arithmetic behind
 * it is sound:
 *
 *   - a FLOW compares the sum of this window against the sum of the one before it;
 *   - a STOCK compares the latest level against the level at the start of the window,
 *     because summing levels is meaningless;
 *   - fewer than two windows of history produces null, not zero.
 *
 * A percentage against a base of zero is undefined, not "+100%", so `ratio` is null there
 * and the caller shows the absolute change instead.
 */
export function computeDelta(points: Point[], kind: 'STOCK' | 'FLOW', windowDays: number): Delta | null {
  if (points.length < 2) return null;

  if (kind === 'FLOW') {
    // Two adjacent windows. Without a full earlier window the comparison is between
    // unequal spans, which reads as a collapse that never happened.
    if (points.length < windowDays * 2) return null;
    const recent = points.slice(-windowDays);
    const previous = points.slice(-windowDays * 2, -windowDays);
    const sum = (list: Point[]) => list.reduce((total, p) => total + p.value, 0);

    const now = sum(recent);
    const before = sum(previous);
    return {
      change: now - before,
      ratio: before === 0 ? null : (now - before) / before,
      against: `previous ${windowDays} days`,
    };
  }

  const latest = points[points.length - 1]!.value;
  const earliest = points[0]!.value;
  return {
    change: latest - earliest,
    ratio: earliest === 0 ? null : (latest - earliest) / earliest,
    against: `${points.length} days ago`,
  };
}

/**
 * Whether an increase is a good thing.
 *
 * Not cosmetic. "Overdue requests up 40%" in the same green as "registrations up 40%" tells
 * a reader the opposite of the truth, and on this dashboard the second number is people
 * reached and the first is people waiting. Anything not listed here is treated as neutral
 * and gets no colour at all, which is the safe default for a measure nobody has thought
 * about yet.
 */
const UP_IS_BAD = new Set([
  'service_requests.overdue',
  'cases.escalated',
  'referrals.awaiting_follow_up',
  'permits.expiring_30d',
  'transactions.pending_approval',
  'transactions.pending_approval_value',
  'beneficiaries.pending_verification',
]);

const UP_IS_GOOD = new Set([
  'beneficiaries.registered',
  'beneficiaries.active',
  'cases.closed',
  'service_requests.resolved',
  'enrollments.active',
  'attendance.present',
  'events.attendance',
  'donations.settled_count',
  'donations.settled_value',
]);

export type Direction = 'good' | 'bad' | 'neutral';

export function directionOf(key: string, change: number): Direction {
  if (change === 0) return 'neutral';
  const rising = change > 0;
  if (UP_IS_GOOD.has(key)) return rising ? 'good' : 'bad';
  if (UP_IS_BAD.has(key)) return rising ? 'bad' : 'good';
  return 'neutral';
}

/** "+12%" / "−4%" / "+3" when a proportion would be undefined. */
export function formatDelta(delta: Delta): string {
  const sign = delta.change > 0 ? '+' : delta.change < 0 ? '−' : '';
  if (delta.ratio === null) return `${sign}${Math.abs(delta.change)}`;
  return `${sign}${Math.abs(Math.round(delta.ratio * 100))}%`;
}
