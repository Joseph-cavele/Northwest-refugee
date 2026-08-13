import { describe, expect, it } from 'vitest';
import { describeSeats } from '@/features/programmes/lib/seats';

/*
 * Cohort occupancy.
 *
 * The rule worth testing hardest is that free seats never imply an open door: only PLANNED
 * and OPEN cohorts take enrolments, and a RUNNING one with space is still closed. Getting
 * that backwards sends an intake officer to enrol someone who cannot be enrolled, and the
 * screen looks perfectly reasonable while doing it.
 */

describe('describeSeats', () => {
  it('reports remaining seats on a cohort that is open', () => {
    expect(describeSeats({ taken: 18, capacity: 30, enrollable: true })).toEqual({
      kind: 'OPEN',
      taken: 18,
      capacity: 30,
      remaining: 12,
      ratio: 0.6,
    });
  });

  it('never advertises seats on a cohort that is closed', () => {
    // 12 seats free, but the cohort is running. The door is shut.
    const standing = describeSeats({ taken: 18, capacity: 30, enrollable: false });
    expect(standing.kind).toBe('CLOSED');
    expect(standing).not.toHaveProperty('remaining');
  });

  it('reports FULL only when the cohort is otherwise open', () => {
    expect(describeSeats({ taken: 30, capacity: 30, enrollable: true })).toMatchObject({
      kind: 'FULL',
      ratio: 1,
    });
    // Full and closed is just closed — "full" would imply it would take someone if a seat
    // freed up, which it would not.
    expect(describeSeats({ taken: 30, capacity: 30, enrollable: false }).kind).toBe('CLOSED');
  });

  it('surfaces a breach of the ceiling rather than clamping it away', () => {
    // The seat claim is a guarded atomic update, so this means the guard did not hold or
    // the row was edited by hand. Showing "30 of 30" would hide the only evidence there is.
    expect(describeSeats({ taken: 32, capacity: 30, enrollable: true })).toEqual({
      kind: 'OVERSUBSCRIBED',
      taken: 32,
      capacity: 30,
      over: 2,
      ratio: 1,
    });
  });

  it('surfaces a breach on a closed cohort too', () => {
    expect(describeSeats({ taken: 32, capacity: 30, enrollable: false }).kind).toBe(
      'OVERSUBSCRIBED'
    );
  });

  it('draws no ratio without a usable capacity', () => {
    for (const capacity of [0, -5, Number.NaN]) {
      expect(describeSeats({ taken: 4, capacity, enrollable: true })).toEqual({
        kind: 'NO_CAPACITY',
        taken: 4,
        ratio: null,
      });
    }
  });

  it('treats a missing or negative headcount as none taken', () => {
    expect(describeSeats({ taken: -3, capacity: 30, enrollable: true })).toMatchObject({
      taken: 0,
      remaining: 30,
    });
    expect(describeSeats({ taken: Number.NaN, capacity: 30, enrollable: true })).toMatchObject({
      taken: 0,
    });
  });

  it('keeps the ratio inside the track', () => {
    const empty = describeSeats({ taken: 0, capacity: 30, enrollable: true });
    const over = describeSeats({ taken: 90, capacity: 30, enrollable: true });
    expect(empty.ratio).toBe(0);
    expect(over.ratio).toBe(1);
  });
});
