import { describe, expect, it } from 'vitest';
import { describeTurnout } from '@/features/events/lib/turnout';

/*
 * Planned attendance against actual.
 *
 * The rule worth the most tests is that an event still ahead has not under-performed.
 * `recordedAttendance` is zero until someone works the register, so the naive subtraction
 * reports every future event as a catastrophic shortfall — and once a screen cries wolf
 * about next month's dialogue, nobody reads it about last week's.
 */

describe('describeTurnout', () => {
  it('judges nothing about an event still ahead', () => {
    const standing = describeTurnout({
      recorded: 0,
      expected: 250,
      status: 'CONFIRMED',
      isPast: false,
    });
    expect(standing).toEqual({ kind: 'UPCOMING', expected: 250 });
    // The shape carries no shortfall at all — there is nothing for a caller to render.
    expect(standing).not.toHaveProperty('by');
  });

  it('judges nothing about a cancelled event, past or not', () => {
    for (const isPast of [true, false]) {
      expect(describeTurnout({ recorded: 0, expected: 250, status: 'CANCELLED', isPast })).toEqual({
        kind: 'CANCELLED',
      });
    }
  });

  it('trusts COMPLETED over the clock', () => {
    // A register is often worked up the next morning, and the start date can lag. Marked
    // complete means finished.
    const standing = describeTurnout({
      recorded: 180,
      expected: 200,
      status: 'COMPLETED',
      isPast: false,
    });
    expect(standing).toMatchObject({ kind: 'SHORT', by: 20 });
  });

  it('reports a shortfall on a held event', () => {
    expect(
      describeTurnout({ recorded: 180, expected: 200, status: 'COMPLETED', isPast: true })
    ).toEqual({ kind: 'SHORT', recorded: 180, expected: 200, by: 20, ratio: 0.9 });
  });

  it('reports exactly meeting the plan', () => {
    expect(
      describeTurnout({ recorded: 200, expected: 200, status: 'COMPLETED', isPast: true })
    ).toMatchObject({ kind: 'MET', ratio: 1 });
  });

  it('lets turnout exceed the plan without clamping', () => {
    // Unlike cohort seats, there is no ceiling here: 300 people at a 200-person event is a
    // real fact about the day, not an integrity problem.
    expect(
      describeTurnout({ recorded: 300, expected: 200, status: 'COMPLETED', isPast: true })
    ).toEqual({ kind: 'OVER', recorded: 300, expected: 200, by: 100, ratio: 1.5 });
  });

  it('stands the count on its own when nobody set a target', () => {
    expect(
      describeTurnout({ recorded: 46, expected: 0, status: 'COMPLETED', isPast: true })
    ).toEqual({ kind: 'NO_TARGET', recorded: 46 });
  });

  it('treats a missing or negative count as none', () => {
    expect(
      describeTurnout({ recorded: Number.NaN, expected: 100, status: 'COMPLETED', isPast: true })
    ).toMatchObject({ kind: 'SHORT', recorded: 0, by: 100 });
  });

  it('does not judge an event whose start date is unknown', () => {
    // isPast is null when there is no usable start date. Absent evidence that it happened,
    // it has not happened.
    expect(
      describeTurnout({ recorded: 0, expected: 80, status: 'PLANNED', isPast: null })
    ).toEqual({ kind: 'UPCOMING', expected: 80 });
  });
});
