/*
 * How full a cohort is, and whether anyone can still join it.
 *
 * THESE ARE TWO DIFFERENT QUESTIONS AND THE SCREEN MUST NOT CONFLATE THEM. A cohort that is
 * RUNNING or COMPLETED can have empty seats and still be closed — only PLANNED and OPEN
 * take enrolments (COHORT_ENROLLABLE in programme.model.js). Rendering "10 seats left" on a
 * cohort that started three weeks ago sends an intake officer to enrol someone into a room
 * they cannot join, and they find out at the door. So the standing below leads with
 * openness and treats the count as a detail of it, never the other way round.
 *
 * `enrolledCount` is denormalised on the cohort so a seat can be claimed with one atomic
 * update — modules/enrollments owns every change to it. Which means a count ABOVE capacity
 * is not merely cosmetic: it says that guard did not hold, or the row was edited by hand.
 * It gets its own state rather than being clamped away, because silently showing "30 of 30"
 * for a cohort holding 32 people hides the only evidence anyone would ever see.
 */

export type SeatStanding =
  /** No usable ceiling recorded. There is a headcount but no ratio to draw. */
  | { kind: 'NO_CAPACITY'; taken: number; ratio: null }
  /** More people than seats. A breach of the ceiling, shown whatever the status. */
  | { kind: 'OVERSUBSCRIBED'; taken: number; capacity: number; over: number; ratio: 1 }
  /** Not taking enrolments — whatever the seat count says. */
  | { kind: 'CLOSED'; taken: number; capacity: number; ratio: number }
  | { kind: 'FULL'; taken: number; capacity: number; ratio: 1 }
  | { kind: 'OPEN'; taken: number; capacity: number; remaining: number; ratio: number };

export function describeSeats({
  taken,
  capacity,
  enrollable,
}: {
  taken: number;
  capacity: number;
  /** The cohort's `isEnrollable` virtual — PLANNED or OPEN, and not deleted. */
  enrollable: boolean;
}): SeatStanding {
  const held = Number.isFinite(taken) && taken > 0 ? Math.floor(taken) : 0;

  if (!Number.isFinite(capacity) || capacity <= 0) {
    return { kind: 'NO_CAPACITY', taken: held, ratio: null };
  }

  const seats = Math.floor(capacity);

  // Checked before openness: a ceiling that has been breached is a system-integrity signal,
  // and it is worth seeing on a completed cohort as much as on one still filling.
  if (held > seats) {
    return { kind: 'OVERSUBSCRIBED', taken: held, capacity: seats, over: held - seats, ratio: 1 };
  }

  const ratio = held / seats;

  // Before FULL, so a closed cohort never advertises the seats it is not offering.
  if (!enrollable) return { kind: 'CLOSED', taken: held, capacity: seats, ratio };

  if (held === seats) return { kind: 'FULL', taken: held, capacity: seats, ratio: 1 };

  return { kind: 'OPEN', taken: held, capacity: seats, remaining: seats - held, ratio };
}
