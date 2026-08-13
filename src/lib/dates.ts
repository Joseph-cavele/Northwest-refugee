/*
 * Dates render in Africa/Johannesburg, always.
 *
 * The server stores UTC and the office is in Rustenburg, so formatting in the
 * browser's local zone would show a Cape Town figure to a funder abroad and quietly
 * shift an intake date across midnight. Pinning the zone means a session captured at
 * 01:00 SAST reads as that date to everyone who opens the record.
 */

import { TIMEZONE } from '@/types/enums';

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmt(options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-ZA', { timeZone: TIMEZONE, ...options });
}

const dateFmt = fmt({ day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = fmt({
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const timeFmt = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
const monthFmt = fmt({ month: 'long', year: 'numeric' });

/** An em dash, not an empty string — a blank cell reads as a rendering bug. */
const EMPTY = '—';

/** `formatDate('2026-03-14T…')` → `14 Mar 2026`. */
export function formatDate(value: DateInput): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : EMPTY;
}

/** `14 Mar 2026, 09:30`. Use where the time of day carries meaning — audit, messages. */
export function formatDateTime(value: DateInput): string {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : EMPTY;
}

export function formatTime(value: DateInput): string {
  const d = toDate(value);
  return d ? timeFmt.format(d) : EMPTY;
}

export function formatMonth(value: DateInput): string {
  const d = toDate(value);
  return d ? monthFmt.format(d) : EMPTY;
}

/**
 * The `YYYY-MM-DD` an `<input type="date">` requires, in SAST.
 *
 * `toISOString().slice(0, 10)` is the tempting one-liner and it is wrong: it converts
 * to UTC first, so anything before 02:00 SAST lands on the previous day. A date of
 * birth off by one is a beneficiary who is suddenly seventeen.
 */
export function toDateInputValue(value: DateInput): string {
  const d = toDate(value);
  if (!d) return '';
  // en-CA gives ISO-ordered parts, which is exactly the input format.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const DIVISIONS: { limit: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { limit: 60, unit: 'second' },
  { limit: 3600, unit: 'minute' },
  { limit: 86_400, unit: 'hour' },
  { limit: 604_800, unit: 'day' },
  { limit: 2_629_800, unit: 'week' },
  { limit: 31_557_600, unit: 'month' },
  { limit: Infinity, unit: 'year' },
];

const SECONDS_PER: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86_400,
  week: 604_800,
  month: 2_629_800,
  year: 31_557_600,
};

/**
 * "3 days ago", "in 2 hours".
 *
 * Pair it with the absolute date rather than replacing it. "2 months ago" is fine for
 * a chat message; on a permit expiry or an SLA due date the actual day is what someone
 * needs, so those show both.
 */
export function formatRelative(value: DateInput): string {
  const d = toDate(value);
  if (!d) return EMPTY;

  const deltaSeconds = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(deltaSeconds);

  for (const { limit, unit } of DIVISIONS) {
    if (abs < limit) {
      const per = SECONDS_PER[unit] ?? 1;
      return relative.format(Math.round(deltaSeconds / per), unit);
    }
  }
  return dateFmt.format(d);
}

/** The SAST calendar day as an integer, so two dates can simply be subtracted. */
function sastDayNumber(value: DateInput): number | null {
  const ymd = toDateInputValue(value);
  if (!ymd) return null;
  // Re-parsed as UTC midnight purely to turn a Y-M-D string into a day index.
  return Math.round(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
}

/**
 * Whole CALENDAR days from `from` to `value`, in SAST. Negative is in the past — an
 * overdue SLA or an expired permit.
 *
 * Calendar days, not 24-hour blocks, and the distinction is the whole point. A permit
 * expires ON a date and an SLA falls due ON a date; neither happens 24 hours after the
 * instant someone opened the screen. Dividing milliseconds answers "0 days" for most of
 * the final day and can read tomorrow morning as today — which on this system means
 * telling someone their permit is fine when it lapses in the morning.
 *
 * @param from defaults to now. Pass the screen's fixed instant so every row on a page is
 *   measured against the same moment.
 */
export function daysUntil(value: DateInput, from: DateInput = Date.now()): number | null {
  const target = sastDayNumber(value);
  const origin = sastDayNumber(from);
  if (target === null || origin === null) return null;
  return target - origin;
}

export function isPast(value: DateInput): boolean {
  const d = toDate(value);
  return d !== null && d.getTime() < Date.now();
}

/**
 * Age in whole years, in SAST.
 *
 * Used to decide whether a beneficiary is a minor, which gates the guardian
 * requirement — so it counts calendar years properly rather than dividing by 365.25.
 */
export function ageFrom(dateOfBirth: DateInput): number | null {
  const dob = toDate(dateOfBirth);
  if (!dob) return null;

  const today = toDateInputValue(new Date());
  const born = toDateInputValue(dob);
  const [ty = '0', tm = '1', td = '1'] = today.split('-');
  const [by = '0', bm = '1', bd = '1'] = born.split('-');

  let age = Number(ty) - Number(by);
  if (Number(tm) < Number(bm) || (Number(tm) === Number(bm) && Number(td) < Number(bd))) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

export function isMinor(dateOfBirth: DateInput): boolean {
  const age = ageFrom(dateOfBirth);
  return age !== null && age < 18;
}
