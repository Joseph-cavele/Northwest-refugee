import { daysUntil } from '@/lib/dates';

/*
 * Where a permit stands, as a value rather than a rendering.
 *
 * Separated from the component for the same reason overview/lib/series.ts is: this is
 * arithmetic with a wrong answer that looks entirely plausible on screen. "Expires in 12
 * days" off by one sends someone to Home Affairs on the wrong day, and nothing about the
 * page would look broken.
 *
 * DAYS ARE COUNTED IN CALENDAR DAYS, SAST — not in 24-hour blocks from now.
 *
 * A permit expires ON a date; it does not expire 24 hours from the instant someone opens
 * the record. Dividing milliseconds gives "0 days left" for most of the final day and can
 * read a permit expiring tomorrow morning as expiring today. Counting the days between two
 * dates in Africa/Johannesburg — the zone the whole app renders in, and the one the office
 * is actually in — is the question a caseworker is asking.
 */

/**
 * The horizon the permit-expiry job works to, so it is the horizon every screen uses.
 * A register that flags at 30 days beside a record that flags at 14 teaches a caseworker
 * to trust neither.
 */
export const EXPIRY_HORIZON_DAYS = 30;

export type PermitStanding =
  /**
   * No expiry date on the record. Common and legitimate — not a gap to be filled.
   * `elapsed` is present and null rather than absent, so a caller can read it without
   * first narrowing the union: there is no fraction of a permit that does not exist.
   */
  | { kind: 'NONE'; elapsed: null }
  | { kind: 'EXPIRED'; days: number; elapsed: number | null }
  | { kind: 'EXPIRING'; days: number; elapsed: number | null }
  | { kind: 'VALID'; days: number; elapsed: number | null };

/**
 * @param expiresAt  null for a record with no permit date.
 * @param issuedAt   drives the elapsed fraction only. Null leaves it null — a bar drawn
 *   without a start date would be inventing the geometry it appears to measure.
 * @param serverSaysExpired the `permitExpired` virtual. Trusted when it disagrees: the
 *   server compared against its own clock, and a laptop with a wrong date should not be
 *   able to make an expired permit look valid.
 */
export function describePermit({
  expiresAt,
  issuedAt = null,
  now,
  serverSaysExpired = null,
}: {
  expiresAt: string | null;
  issuedAt?: string | null;
  now: number;
  serverSaysExpired?: boolean | null;
}): PermitStanding {
  if (!expiresAt) return { kind: 'NONE', elapsed: null };

  const days = daysUntil(expiresAt, now);
  if (days === null) return { kind: 'NONE', elapsed: null };

  /*
   * The bar is drawn only from a genuinely positive span. Issued on or after expiry is bad
   * data, and dividing by it yields Infinity or a negative — better to draw no bar at all
   * than a confident-looking wrong one.
   */
  const span = issuedAt === null ? null : daysUntil(expiresAt, issuedAt);
  const consumed = issuedAt === null ? null : daysUntil(now, issuedAt);
  const elapsed =
    span === null || consumed === null || span <= 0
      ? null
      : Math.min(1, Math.max(0, consumed / span));

  const expired = serverSaysExpired === true || days < 0;
  if (expired) {
    return { kind: 'EXPIRED', days: Math.abs(days), elapsed: elapsed === null ? null : 1 };
  }
  // `days === 0` is "expires today" — still valid, and the most urgent thing on the page.
  if (days <= EXPIRY_HORIZON_DAYS) return { kind: 'EXPIRING', days, elapsed };
  return { kind: 'VALID', days, elapsed };
}
