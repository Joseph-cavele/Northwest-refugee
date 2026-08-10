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

/*
 * SAST is UTC+2 all year — no daylight saving since 1944 — so shifting by two hours lets
 * the UTC getters read the South African wall clock. The same trick as utils/dates.js on
 * the server, and the reason a day boundary here never drifts.
 */
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

/**
 * Sum daily points into calendar weeks, Monday first.
 *
 * ONLY EVER VALID FOR A FLOW. A flow is an amount over a period, so a week is the sum of
 * its days — that is what the word means. A STOCK is a level at a moment, and adding seven
 * days of "open cases" produces a number roughly seven times larger than anything that was
 * ever true. The caller checks `kind`; this function cannot, so it says so here.
 *
 * WHY BUCKET AT ALL: forty-six daily slots in a grouped bar chart gives each bar about
 * three pixels, which is a texture rather than a comparison. Seven weekly bars are legible,
 * and a week is also the unit a supervisor actually reasons in.
 */
export function sumIntoWeeks(points: Point[]): Point[] {
  const weeks = new Map<string, number>();

  for (const point of points) {
    const date = new Date(point.date);
    if (Number.isNaN(date.getTime())) continue;

    const wall = new Date(date.getTime() + SAST_OFFSET_MS);
    // getUTCDay(): 0 is Sunday. Shift so Monday starts the week, which is how a South
    // African working week is counted.
    const dayOfWeek = (wall.getUTCDay() + 6) % 7;
    const monday = new Date(wall.getTime() - dayOfWeek * 86_400_000);
    const key = new Date(
      Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()) - SAST_OFFSET_MS
    ).toISOString();

    weeks.set(key, (weeks.get(key) ?? 0) + point.value);
  }

  return [...weeks.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
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
