import { TIMEZONE } from '../config/constants.js';

// Ages are derived, never stored. A stored age is wrong within a year, and "is this
// person still a minor" drives child-protection handling — it has to be true today, not
// true on the day someone typed it in.

export const AGE_BANDS = Object.freeze([
  '0-5',
  '6-12',
  '13-17',
  '18-24',
  '25-34',
  '35-49',
  '50-64',
  '65+',
]);

export const MAJORITY_AGE = 18;

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Whole years elapsed, computed in UTC. Using UTC on both sides keeps the result stable
 * regardless of the server's timezone — a birthday must not appear to arrive a day early
 * because the host is set to something other than SAST.
 */
export function ageFrom(dateOfBirth, asOf = new Date()) {
  const dob = toDate(dateOfBirth);
  if (!dob) return null;

  let years = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = asOf.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < dob.getUTCDate())) {
    years -= 1;
  }
  return years < 0 ? null : years;
}

export function isMinor(dateOfBirth, asOf = new Date()) {
  const age = ageFrom(dateOfBirth, asOf);
  return age === null ? null : age < MAJORITY_AGE;
}

/**
 * Bucket for M&E reporting. Bands are reported to donors, so changing a boundary changes
 * every historical figure — treat this list as fixed unless a funder's template forces it.
 */
export function ageBand(dateOfBirth, asOf = new Date()) {
  const age = ageFrom(dateOfBirth, asOf);
  if (age === null) return null;
  if (age <= 5) return '0-5';
  if (age <= 12) return '6-12';
  if (age <= 17) return '13-17';
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 49) return '35-49';
  if (age <= 64) return '50-64';
  return '65+';
}

/** Midnight UTC for a calendar date, so a date of birth never shifts by a day. */
export function startOfDayUTC(value) {
  const date = toDate(value);
  if (!date) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// --- South African calendar days -------------------------------------------------
// Reporting periods are SAST calendar days, not UTC ones. Bucketing by UTC would file
// everything captured between 00:00 and 02:00 SAST under the previous day — the front
// desk opens at 08:00, but the WhatsApp bot runs all night.
//
// The fixed offset is safe here and nowhere else in this file: South Africa has observed
// UTC+2 with no daylight saving since 1944. A country that changed that would need
// Intl.DateTimeFormat with a timeZone, which is far slower per call and unnecessary until
// then.
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

/** The instant SAST midnight began on the calendar day containing `value`. */
export function startOfDaySAST(value = new Date()) {
  const date = toDate(value);
  if (!date) return null;
  // Shifting forward lets the UTC getters read the SAST wall clock, then the same shift
  // back converts the resulting local midnight to a real instant.
  const wallClock = new Date(date.getTime() + SAST_OFFSET_MS);
  const midnight = Date.UTC(wallClock.getUTCFullYear(), wallClock.getUTCMonth(), wallClock.getUTCDate());
  return new Date(midnight - SAST_OFFSET_MS);
}

export function startOfMonthSAST(value = new Date()) {
  const date = toDate(value);
  if (!date) return null;
  const wallClock = new Date(date.getTime() + SAST_OFFSET_MS);
  const first = Date.UTC(wallClock.getUTCFullYear(), wallClock.getUTCMonth(), 1);
  return new Date(first - SAST_OFFSET_MS);
}

/**
 * Half-open range for a SAST calendar day: `from` inclusive, `to` exclusive.
 *
 * Exclusive on purpose. An inclusive end has to be expressed as 23:59:59.999, which
 * silently drops anything captured in the final millisecond of the day and makes two
 * consecutive days fail to tile.
 */
export function sastDayRange(value = new Date()) {
  const from = startOfDaySAST(value);
  if (!from) return null;
  return { from, to: new Date(from.getTime() + 86_400_000) };
}

export function daysBetween(from, to) {
  const a = startOfDayUTC(from);
  const b = startOfDayUTC(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Negative once expired — used by the permit-expiry job and its reminder thresholds. */
export function daysUntil(date, asOf = new Date()) {
  return daysBetween(asOf, date);
}

/** Human-facing dates are South African local time, not UTC. */
export function formatDate(value, locale = 'en-ZA') {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}
