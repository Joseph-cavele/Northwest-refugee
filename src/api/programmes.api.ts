import { api } from './client';
import type { Id, IsoDate } from '@/types/models';
import type { Paginated } from '@/types/api';
import type { ProgrammePillar } from '@/types/enums';
import type { CaseCaseworker } from './cases.api';

/*
 * The /programmes endpoints, typed.
 *
 * Three levels, one hierarchy:
 *
 *   Programme — an ongoing offering, permanently attached to one of the five pillars
 *   Cohort    — one run of it, with its own dates, venue and capacity
 *   Session   — one scheduled meeting inside a cohort
 *
 * Enrolment and attendance are a different module: this one owns the schedule, not who
 * turned up. `enrolledCount` below is denormalised onto the cohort so a seat can be claimed
 * atomically, and modules/enrollments owns every change to it — nothing here writes it.
 */

export const PROGRAMME_STATUSES = [
  'PLANNED',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'ARCHIVED',
] as const;
export type ProgrammeStatus = (typeof PROGRAMME_STATUSES)[number];

export const PROGRAMME_STATUS_LABELS: Record<ProgrammeStatus, string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

export const COHORT_STATUSES = ['PLANNED', 'OPEN', 'RUNNING', 'COMPLETED', 'CANCELLED'] as const;
export type CohortStatus = (typeof COHORT_STATUSES)[number];

export const COHORT_STATUS_LABELS: Record<CohortStatus, string> = {
  PLANNED: 'Planned',
  OPEN: 'Open for enrolment',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const SESSION_STATUSES = ['SCHEDULED', 'HELD', 'CANCELLED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  SCHEDULED: 'Scheduled',
  HELD: 'Held',
  CANCELLED: 'Cancelled',
};

export interface Programme {
  _id: Id;
  name: string;
  /** Permanent after PLANNED — every report groups by it, so it cannot be re-pointed. */
  pillar: ProgrammePillar;
  description: string;
  status: ProgrammeStatus;
  /**
   * The other side of `User.programmes`: a coordinator named here is scoped to this
   * programme's whole caseload, so this list is an access-control fact, not a credit line.
   */
  coordinators: (CaseCaseworker | Id)[];
  startDate: IsoDate | null;
  endDate: IsoDate | null;

  /*
   * The screening form applicants answer for this programme. `startScreening` reads it and
   * freezes a copy onto the screening, which is what keeps programme-specific forms out of
   * the code — null is legitimate and means the screening carries notes and a decision only.
   */
  screeningTemplate: Id | null;
  /** The office's own word for the kind of programme. Not the reporting pillar. */
  category: string;
  requirements: string;
  location: string;

  archivedAt: IsoDate | null;
  isArchived: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface ProgrammeInput {
  name: string;
  pillar: ProgrammePillar;
  description?: string;
  category?: string;
  requirements?: string;
  location?: string;
  startDate?: string | null;
  endDate?: string | null;
  screeningTemplate?: Id | null;
}

export function createProgramme(input: ProgrammeInput): Promise<Programme> {
  return api.post<Programme>('/programmes', input);
}

/**
 * `pillar` is accepted but the server refuses to change it once a programme has left
 * PLANNED — every historical figure that grouped by it would silently move.
 */
export function updateProgramme(id: Id, input: Partial<ProgrammeInput>): Promise<Programme> {
  return api.patch<Programme>(`/programmes/${id}`, input);
}

export interface Cohort {
  _id: Id;
  programme: Id;
  name: string;
  startDate: IsoDate;
  endDate: IsoDate;
  /** The ceiling, not a count. */
  capacity: number;
  /** Seats taken. Owned by modules/enrollments — never written from this client. */
  enrolledCount: number;
  venue: string;
  facilitator: CaseCaseworker | Id | null;
  status: CohortStatus;
  cancellationReason: string | null;
  /** Server-computed: PLANNED or OPEN, and not deleted. Free seats do not imply this. */
  isEnrollable: boolean;
  durationDays: number | null;
  createdAt: IsoDate;
}

export interface ProgrammeSession {
  _id: Id;
  cohort: Id;
  title: string;
  scheduledAt: IsoDate;
  durationMinutes: number;
  endsAt: IsoDate | null;
  venue: string;
  facilitator: CaseCaseworker | Id | null;
  status: SessionStatus;
  cancellationReason: string | null;
  notes: string;
  isPast: boolean | null;
}

export interface ListProgrammesQuery {
  page?: number;
  limit?: number;
  pillar?: ProgrammePillar;
  status?: ProgrammeStatus;
  /** Case-insensitive match on the name. A substring, unlike the beneficiary text index. */
  search?: string;
  includeArchived?: boolean;
  sort?: 'name' | '-name' | 'createdAt' | '-createdAt';
}

/** Coordinators are scoped server-side to the programmes they are named on. */
export function listProgrammes(
  query: ListProgrammesQuery = {},
  signal?: AbortSignal
): Promise<Paginated<Programme>> {
  return api.list<Programme>('/programmes', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

export function getProgramme(id: Id, signal?: AbortSignal): Promise<Programme> {
  return api.get<Programme>(`/programmes/${id}`, { signal });
}

export interface ListCohortsQuery {
  page?: number;
  limit?: number;
  status?: CohortStatus;
  /** Cohorts still taking enrolments — what an intake officer needs. */
  enrollableOnly?: boolean;
  sort?: 'startDate' | '-startDate';
}

export function listCohorts(
  programmeId: Id,
  query: ListCohortsQuery = {},
  signal?: AbortSignal
): Promise<Paginated<Cohort>> {
  return api.list<Cohort>(`/programmes/${programmeId}/cohorts`, {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

export function listSessions(
  cohortId: Id,
  query: { page?: number; limit?: number } = {},
  signal?: AbortSignal
): Promise<Paginated<ProgrammeSession>> {
  return api.list<ProgrammeSession>(`/programmes/cohorts/${cohortId}/sessions`, {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

/** The populated shape, or null when the server sent a bare id. */
export function facilitatorOf(cohort: Cohort | ProgrammeSession): CaseCaseworker | null {
  return cohort.facilitator && typeof cohort.facilitator === 'object' ? cohort.facilitator : null;
}

export function coordinatorsOf(programme: Programme): CaseCaseworker[] {
  return programme.coordinators.filter(
    (entry): entry is CaseCaseworker => typeof entry === 'object' && entry !== null
  );
}
