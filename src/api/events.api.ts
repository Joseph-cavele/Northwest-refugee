import { api } from './client';
import type { Id, IsoDate } from '@/types/models';
import type { Paginated } from '@/types/api';
import type { Gender, ProgrammePillar } from '@/types/enums';
import type { CaseCaseworker } from './cases.api';

/*
 * The /events endpoints, typed.
 *
 * AN EVENT REGISTER IS NOT A BENEFICIARY INTAKE, and the whole module is shaped by that.
 * Most people at an awareness day or a community dialogue never become beneficiaries and
 * have consented to nothing — so a participant row carries no name, no number and nothing
 * that could single anyone out. It carries a gender, an age band and whether they had been
 * before, which is what reporting needs and no more.
 *
 * Contact details exist only where someone explicitly asked to be contacted AND that
 * consent was recorded; the server refuses either field without `consentToContact`, and
 * strips `contactPhone` from every JSON response regardless. Nothing in this client should
 * try to display one.
 */

export const EVENT_TYPES = [
  'AWARENESS',
  'OUTREACH',
  'COMMUNITY_DIALOGUE',
  'TRAINING',
  'COMMEMORATION',
  'FUNDRAISER',
  'STAKEHOLDER_MEETING',
  'OTHER',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  AWARENESS: 'Awareness day',
  OUTREACH: 'Outreach',
  COMMUNITY_DIALOGUE: 'Community dialogue',
  TRAINING: 'Training',
  COMMEMORATION: 'Commemoration',
  FUNDRAISER: 'Fundraiser',
  STAKEHOLDER_MEETING: 'Stakeholder meeting',
  OTHER: 'Other',
};

export const EVENT_STATUSES = ['PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  PLANNED: 'Planned',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** Mirrors AGE_BANDS in server/utils/dates.js. Ordered — render them in this order. */
export const AGE_BANDS = ['0-5', '6-12', '13-17', '18-24', '25-34', '35-49', '50-64', '65+'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export interface EventRow {
  _id: Id;
  title: string;
  description: string;
  type: EventType;
  /** Optional: not every event belongs to a programme, but reporting groups by pillar. */
  pillar: ProgrammePillar | null;
  programme: Id | null;
  startsAt: IsoDate;
  endsAt: IsoDate | null;
  venue: string;
  address: string;
  status: EventStatus;
  cancellationReason: string | null;
  /** What was planned for, so the gap against the register is visible. */
  expectedAttendance: number;
  /** Kept in step by the service as participants are recorded. */
  recordedAttendance: number;
  organiser: CaseCaseworker | Id | null;
  isPast: boolean | null;
  /** Server-computed, and null when nothing was expected. Use describeTurnout instead. */
  attendanceVariance: number | null;
  createdAt: IsoDate;
}

export interface ListEventsQuery {
  page?: number;
  limit?: number;
  type?: EventType;
  status?: EventStatus;
  pillar?: ProgrammePillar;
  programme?: Id;
  /** Ahead of now and still PLANNED or CONFIRMED — the diary, not the archive. */
  upcomingOnly?: boolean;
  from?: string;
  to?: string;
  /** Case-insensitive substring of the title. */
  search?: string;
  sort?: 'startsAt' | '-startsAt';
}

export function listEvents(
  query: ListEventsQuery = {},
  signal?: AbortSignal
): Promise<Paginated<EventRow>> {
  return api.list<EventRow>('/events', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

export function getEvent(id: Id, signal?: AbortSignal): Promise<EventRow> {
  return api.get<EventRow>(`/events/${id}`, { signal });
}

/**
 * The demographic rollup: aggregated, never itemised.
 *
 * This is the shape a funder is shown, and it needs no identities to be useful — which is
 * exactly why the detail screen reports attendance from here rather than by listing the
 * participant rows. A tally cannot be read back to a person.
 */
export interface AttendanceBreakdown {
  event: Id;
  total: number;
  expected: number;
  variance: number | null;
  /** Attendees already on the register — consent lives on their beneficiary record. */
  known: number;
  /** Counted and nothing more. The ordinary case at a community event. */
  anonymous: number;
  firstTime: number;
  byGender: Partial<Record<Gender | 'UNKNOWN', number>>;
  byAgeBand: Partial<Record<AgeBand | 'UNKNOWN', number>>;
}

export function getAttendanceBreakdown(
  id: Id,
  signal?: AbortSignal
): Promise<AttendanceBreakdown> {
  return api.get<AttendanceBreakdown>(`/events/${id}/attendance`, { signal });
}

/** The populated shape, or null when the server sent a bare id. */
export function organiserOf(event: EventRow): CaseCaseworker | null {
  return event.organiser && typeof event.organiser === 'object' ? event.organiser : null;
}
