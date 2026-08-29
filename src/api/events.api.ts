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

/*
 * --- publication ---------------------------------------------------------------------
 *
 * PUBLICATION STATE IS NOT EVENT STATUS. `status` above says whether the event is
 * happening — planned, confirmed, done, called off. This says whether the public may see
 * it. The two move independently: an event can be CONFIRMED and unpublished because it is
 * for an invited group, and a PUBLISHED event that is later CANCELLED stays on the public
 * page marked cancelled rather than vanishing, so somebody who read the notice finds out
 * before they travel.
 */
export const PUBLICATION_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
};

export const EVENT_MODES = ['IN_PERSON', 'ONLINE', 'HYBRID'] as const;
export type EventMode = (typeof EVENT_MODES)[number];

export const EVENT_MODE_LABELS: Record<EventMode, string> = {
  IN_PERSON: 'In person',
  ONLINE: 'Online',
  HYBRID: 'In person and online',
};

/** The publishable half of an event — everything the public site is allowed to know. */
export interface EventPublication {
  status: PublicationStatus;
  publishedAt: IsoDate | null;
  publishedBy: Id | null;
  imageUrl: string;
  /** Set only for a Cloudinary upload; a replacement uses it to delete what it replaced. */
  imagePublicId: string | null;
  /** One or two sentences for the listing card. The full description is on the event. */
  summary: string;
  mode: EventMode;
  onlineUrl: string;
  /** "Who the event is for", in plain language. */
  audience: string;
  registrationInfo: string;
  registrationUrl: string;
  contact: string;
}

/**
 * What may be written to the publication block.
 *
 * `status` IS ABSENT AND CANNOT BE SENT. Publishing goes through its own endpoint and its
 * own permission, so an officer who may edit an event cannot put it on the public site by
 * adding one key to a PATCH body. The server refuses it in the same shape.
 */
export type EventPublicationInput = Partial<Omit<EventPublication, 'status' | 'publishedAt' | 'publishedBy' | 'imagePublicId'>>;

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
  publication: EventPublication;
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
  /** Staff-side only: "show me what is still a draft". */
  publication?: PublicationStatus;
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


// --- creating and editing --------------------------------------------------------------

export interface CreateEventInput {
  title: string;
  description?: string;
  type: EventType;
  pillar?: ProgrammePillar | null;
  /** ISO instant. The date and the start time are one value, as they are in the database. */
  startsAt: string;
  endsAt?: string | null;
  venue?: string;
  address?: string;
  expectedAttendance?: number;
  publication?: EventPublicationInput;
}

export type UpdateEventInput = Partial<CreateEventInput> & {
  status?: EventStatus;
  cancellationReason?: string;
};

/** Lands as a DRAFT whatever is sent — nothing reaches the public site without publishing. */
export function createEvent(input: CreateEventInput): Promise<EventRow> {
  return api.post<EventRow>('/events', input);
}

export function updateEvent(id: Id, input: UpdateEventInput): Promise<EventRow> {
  return api.patch<EventRow>(`/events/${id}`, input);
}

/**
 * Put it on the public site, or take it off. Needs `event:publish`.
 *
 * The end state, not a toggle: sending `true` twice is harmless, where a toggle sent twice
 * by an impatient click lands in the opposite state from the one that was chosen.
 *
 * The server refuses to publish an incomplete notice and says what is missing — no summary,
 * no audience, no venue for something in person. Show that message; it is written for the
 * officer reading it.
 */
export function setEventPublication(id: Id, publish: boolean): Promise<EventRow> {
  return api.post<EventRow>(`/events/${id}/publish`, { publish });
}

/**
 * A SOFT delete. The event keeps its attendance register — that register is the evidence
 * shown to a funder — and leaves every listing, staff-side and public. Needs `event:delete`.
 */
export function deleteEvent(id: Id): Promise<EventRow> {
  return api.delete<EventRow>(`/events/${id}`);
}

/**
 * The poster for the public listing.
 *
 * The one upload in this system that produces a publicly addressable URL, because a signed
 * URL expires and a page read by visitors who are not logged in cannot re-sign it. JPEG,
 * PNG or WebP only — a PDF is not a poster.
 */
export function uploadEventImage(id: Id, file: File): Promise<EventRow> {
  const form = new FormData();
  form.append('image', file);
  return api.post<EventRow>(`/events/${id}/image`, form);
}

// --- the public site --------------------------------------------------------------------

/*
 * A DIFFERENT SHAPE FROM EventRow, AND THAT IS THE POINT. The server returns a whitelisted
 * projection rather than the document: no capturing officer, no expected or recorded
 * attendance, no programme, no pillar, no publication block. What is not in this interface
 * is not merely hidden by the UI — it never crosses the wire.
 */
export interface PublicEvent {
  id: Id;
  title: string;
  /** The kind of occasion, used as the category chip. Says nothing about any person. */
  type: EventType;
  description: string;
  summary: string;
  imageUrl: string;
  startsAt: IsoDate;
  endsAt: IsoDate | null;
  venue: string;
  address: string;
  mode: EventMode;
  onlineUrl: string;
  audience: string;
  registrationInfo: string;
  registrationUrl: string;
  contact: string;
  /** A cancelled event stays on the site so nobody travels to a locked door. */
  isCancelled: boolean;
  publishedAt: IsoDate | null;
}

export interface ListPublicEventsQuery {
  page?: number;
  limit?: number;
  mode?: EventMode;
  /** The archive. Default false, which is "from the start of today, soonest first". */
  past?: boolean;
}

/** No authentication: somebody looking for a meeting must not need an account to find it. */
export function listPublicEvents(
  query: ListPublicEventsQuery = {},
  signal?: AbortSignal
): Promise<Paginated<PublicEvent>> {
  return api.list<PublicEvent>('/public/events', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

/** 404 for a draft, never 403 — a 403 would confirm the event exists. */
export function getPublicEvent(id: Id, signal?: AbortSignal): Promise<PublicEvent> {
  return api.get<PublicEvent>(`/public/events/${id}`, { signal });
}
