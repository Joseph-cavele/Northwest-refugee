import { describe, it, expect } from 'vitest';
import {
  computeDelta,
  directionOf,
  formatDelta,
  sumIntoWeeks,
  toPoints,
} from '@/features/overview/lib/series';
import type { MetricRow } from '@/api/reports.api';

/*
 * The arithmetic behind the dashboard's charts and deltas.
 *
 * These are the rules that decide whether a number on screen is true, so they are worth
 * protecting with a regression test rather than a comment: a stock summed across days, or a
 * flow compared against an unequal window, produces a figure that looks entirely plausible
 * and is wrong by a factor nobody can spot by eye.
 */

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

/** The SAST midnight for `daysAgo`, in the shape the server stores. */
function sastDay(daysAgo: number): string {
  const wall = new Date(Date.now() - daysAgo * 86_400_000 + SAST_OFFSET_MS);
  const midnight =
    Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - SAST_OFFSET_MS;
  return new Date(midnight).toISOString();
}

const days = (count: number, value: (i: number) => number) =>
  Array.from({ length: count }, (_, i) => ({ date: sastDay(count - 1 - i), value: value(i) }));

const weekdayOf = (iso: string) => new Date(new Date(iso).getTime() + SAST_OFFSET_MS).getUTCDay();

describe('sumIntoWeeks', () => {
  it('collapses a long daily series into a readable number of bars', () => {
    // The reason this function exists: 46 daily slots gave each bar about three pixels.
    const weeks = sumIntoWeeks(days(46, () => 1));
    expect(weeks.length).toBeLessThanOrEqual(8);
    expect(weeks.length).toBeGreaterThanOrEqual(7);
  });

  it('preserves the total — a week is the sum of its days, not a sample of them', () => {
    const points = days(46, (i) => i % 5);
    const daily = points.reduce((total, p) => total + p.value, 0);
    const weekly = sumIntoWeeks(points).reduce((total, p) => total + p.value, 0);
    expect(weekly).toBe(daily);
  });

  it('starts every bucket on a Monday', () => {
    // 1 is Monday. A South African working week is counted from it, and a chart whose
    // buckets start mid-week cannot be compared against anything anyone else produces.
    for (const week of sumIntoWeeks(days(46, () => 1))) {
      expect(weekdayOf(week.date)).toBe(1);
    }
  });

  it('fills interior weeks with exactly seven days', () => {
    const weeks = sumIntoWeeks(days(46, () => 1));
    // The first and last are partial by definition; everything between must be whole, or
    // the bars are not comparable to each other.
    for (const week of weeks.slice(1, -1)) expect(week.value).toBe(7);
  });

  it('returns buckets oldest first, so a chart reads left to right', () => {
    const weeks = sumIntoWeeks(days(46, () => 1));
    const sorted = [...weeks].sort((a, b) => a.date.localeCompare(b.date));
    expect(weeks).toEqual(sorted);
  });

  it('survives an empty series and a single day', () => {
    expect(sumIntoWeeks([])).toEqual([]);
    expect(sumIntoWeeks(days(1, () => 3))).toHaveLength(1);
  });
});

describe('computeDelta', () => {
  it('refuses a comparison it cannot make', () => {
    // Fewer than two points is not a trend, and a dashboard that shows one anyway is
    // asserting a direction nobody measured.
    expect(computeDelta([], 'STOCK', 30)).toBeNull();
    expect(computeDelta(days(1, () => 5), 'STOCK', 30)).toBeNull();
  });

  it('refuses a FLOW without two full windows to compare', () => {
    // 46 days cannot answer "against the previous 30" — the earlier window is short, and
    // comparing unequal spans reads as a collapse that never happened.
    expect(computeDelta(days(46, () => 1), 'FLOW', 30)).toBeNull();
    expect(computeDelta(days(60, () => 1), 'FLOW', 30)).not.toBeNull();
  });

  it('sums a FLOW across each window', () => {
    // 30 days of 1 then 30 days of 2 — 30 against 60.
    const delta = computeDelta(days(60, (i) => (i < 30 ? 1 : 2)), 'FLOW', 30)!;
    expect(delta.change).toBe(30);
    expect(delta.ratio).toBeCloseTo(1);
  });

  it('compares a STOCK end to end, never by summing', () => {
    // Levels: 10 then 25. The answer is +15, not the total of every day in between.
    const delta = computeDelta(days(40, (i) => (i < 20 ? 10 : 25)), 'STOCK', 30)!;
    expect(delta.change).toBe(15);
  });

  it('leaves the ratio null when the earlier figure was zero', () => {
    // A percentage against a base of zero is undefined, not "+100%".
    const delta = computeDelta(days(40, (i) => (i === 39 ? 8 : 0)), 'STOCK', 30)!;
    expect(delta.ratio).toBeNull();
    expect(formatDelta(delta)).toBe('+8');
  });
});

describe('directionOf', () => {
  it('knows that more overdue work is bad and more registrations are good', () => {
    // The reason this exists: an arrow alone would tell the reader the opposite of the
    // truth on half the metrics on this dashboard.
    expect(directionOf('service_requests.overdue', 5)).toBe('bad');
    expect(directionOf('service_requests.overdue', -5)).toBe('good');
    expect(directionOf('beneficiaries.registered', 5)).toBe('good');
    expect(directionOf('beneficiaries.registered', -5)).toBe('bad');
  });

  it('stays neutral for anything nobody has classified', () => {
    // The safe default for a measure that has not been thought about: no colour at all.
    expect(directionOf('some.new.metric', 5)).toBe('neutral');
    expect(directionOf('cases.open', 0)).toBe('neutral');
  });
});

describe('toPoints', () => {
  const row = (key: string, dimension: string | null, value: number): MetricRow => ({
    _id: `${key}-${dimension}-${value}`,
    date: sastDay(1),
    key,
    dimension,
    dimensionValue: dimension ? 'EDUCATION' : null,
    value,
    unit: 'COUNT',
    kind: 'STOCK',
  });

  it('takes the organisation-wide rows and leaves the breakdown out', () => {
    // Mixing a dimensioned row in with its own total is how a caller ends up counting the
    // same figure twice.
    const points = toPoints([row('cases.open', null, 10), row('cases.open', 'pillar', 4)], 'cases.open');
    expect(points).toHaveLength(1);
    expect(points[0]!.value).toBe(10);
  });

  it('ignores rows for other metrics', () => {
    expect(toPoints([row('cases.closed', null, 3)], 'cases.open')).toEqual([]);
  });
});
