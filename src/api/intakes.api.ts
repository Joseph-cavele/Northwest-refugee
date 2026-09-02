import { api } from './client';
import type { Id, IsoDate } from '@/types/models';
import type { Paginated } from '@/types/api';
import type { Gender, ImmigrationStatus, SupportedLanguage } from '@/types/enums';

/*
 * The staff side of intake: applications, before anybody has decided anything about them.
 *
 * SEPARATE FROM `intake.api.ts`, WHICH IS THE PUBLIC FORM. That one posts to
 * /api/v1/intake as an applicant, unauthenticated. Everything here is /api/v1/intakes
 * (plural), permission-gated, and read by staff. Two files because they are two audiences
 * with two contracts, and merging them would put a public payload type next to a staff one
 * where somebody could reach for the wrong shape.
 *
 * AN INTAKE IS NOT A BENEFICIARY. Nothing in this module creates a register record. That
 * happens once, on a screening decision, in `screening.api.ts`.
 */

export const INTAKE_SOURCES = ['WALK_IN', 'ONLINE', 'REFERRAL', 'OTHER'] as const;
export type IntakeSource = (typeof INTAKE_SOURCES)[number];

export const INTAKE_SOURCE_LABELS: Record<IntakeSource, string> = {
  WALK_IN: 'Walk-in',
  ONLINE: 'Online',
  REFERRAL: 'Referral',
  OTHER: 'Other',
};

export const INTAKE_STATUSES = [
  'PENDING_SCREENING',
  'IN_SCREENING',
  'APPROVED',
  'WAITING_LIST',
  'MORE_INFO_REQUIRED',
  'NOT_ELIGIBLE',
  'REFERRED',
  'WITHDRAWN',
] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const INTAKE_STATUS_LABELS: Record<IntakeStatus, string> = {
  PENDING_SCREENING: 'Pending screening',
  IN_SCREENING: 'Being screened',
  APPROVED: 'Approved',
  WAITING_LIST: 'Waiting list',
  MORE_INFO_REQUIRED: 'More information needed',
  NOT_ELIGIBLE: 'Not eligible',
  REFERRED: 'Referred on',
  WITHDRAWN: 'Withdrawn',
};

/** Still waiting on NWHR for something. Mirrors OPEN_INTAKE_STATUS on the server. */
export const OPEN_INTAKE_STATUSES: IntakeStatus[] = [
  'PENDING_SCREENING',
  'IN_SCREENING',
  'WAITING_LIST',
  'MORE_INFO_REQUIRED',
];

/** The populated shape when the server sent one, or a bare id. */
export interface LinkedBeneficiary {
  _id: Id;
  referenceCode: string;
  firstName: string;
  lastName: string;
  status: string;
}

export interface IntakeRow {
  _id: Id;
  reference: string;
  firstName: string;
  lastName: string;
  otherNames: string;
  dateOfBirth: IsoDate | null;
  gender: Gender;
  nationality: string;
  languages: SupportedLanguage[];
  immigrationStatus: ImmigrationStatus | null;
  /*
   * `email` is absent from every response — `select: false` on the model and stripped again
   * in toJSON, exactly as on the register. Nothing here should try to display one.
   */
  contact: { cellphone: string; address: string; suburb: string };
  household: { size: number; dependants: number };
  reasonForVisit: string;
  requestedSupport: string;
  requestedProgramme: { _id: Id; name: string } | Id | null;
  source: IntakeSource;
  referredBy: string;
  status: IntakeStatus;
  linkedBeneficiary: LinkedBeneficiary | Id | null;
  linkedAt: IsoDate | null;
  notes: string;
  capturedBy: Id | null;
  receivedAt: IsoDate;
  createdAt: IsoDate;
}

export interface ListIntakesQuery {
  page?: number;
  limit?: number;
  status?: IntakeStatus;
  source?: IntakeSource;
  /** Everything still waiting on NWHR, whatever its particular state. */
  openOnly?: boolean;
  search?: string;
  sort?: 'receivedAt' | '-receivedAt';
}

export function listIntakes(
  query: ListIntakesQuery = {},
  signal?: AbortSignal
): Promise<Paginated<IntakeRow>> {
  return api.list<IntakeRow>('/intakes', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

export function getIntake(id: Id, signal?: AbortSignal): Promise<IntakeRow> {
  return api.get<IntakeRow>(`/intakes/${id}`, { signal });
}

export interface WalkInIntakeInput {
  firstName: string;
  lastName: string;
  otherNames?: string;
  dateOfBirth?: string;
  gender?: Gender;
  nationality?: string;
  languages?: SupportedLanguage[];
  immigrationStatus?: ImmigrationStatus | null;
  contact?: { cellphone?: string; email?: string; address?: string; suburb?: string };
  household?: { size?: number; dependants?: number };
  reasonForVisit?: string;
  requestedSupport?: string;
  requestedProgramme?: Id | null;
  source?: IntakeSource;
  referredBy?: string;
  notes?: string;
  /*
   * Captured before anything is stored, and the method is the register's own vocabulary so
   * it carries across verbatim when the person is approved.
   */
  consent: { given: true; method: 'SIGNED_FORM' | 'VERBAL_WITNESSED' | 'WHATSAPP'; policyVersion?: string };
}

/** Creates an Intake. Never a Beneficiary — that needs a screening decision. */
export function createWalkInIntake(input: WalkInIntakeInput): Promise<IntakeRow> {
  return api.post<IntakeRow>('/intakes', input);
}

export function updateIntake(id: Id, input: Partial<WalkInIntakeInput>): Promise<IntakeRow> {
  return api.patch<IntakeRow>(`/intakes/${id}`, input);
}

// --- duplicates ---------------------------------------------------------------------------

export interface DuplicateMatch {
  _id: Id;
  referenceCode: string;
  firstName: string;
  lastName: string;
  dateOfBirth: IsoDate | null;
  nationality: string;
  status: string;
  contact?: { cellphone?: string };
  createdAt: IsoDate;
  /** Why this row came back — phone, email, name and date of birth. */
  matchedOn: string[];
}

/**
 * Who on the register might already be this person.
 *
 * CANDIDATES, NOT ANSWERS — two cousins share a surname and a birthday, a household shares a
 * phone. The officer looks and decides; nothing is merged automatically.
 *
 * A POST with the details in the body, never a GET: a query string carrying somebody's name
 * and birthday ends up in access logs, browser history and every proxy in between.
 */
export function findDuplicates(
  search: { firstName?: string; lastName?: string; dateOfBirth?: string; contact?: { cellphone?: string; email?: string } },
  signal?: AbortSignal
): Promise<DuplicateMatch[]> {
  return api.post<DuplicateMatch[]>('/intakes/duplicates', search, { signal });
}

/** Attach this application to somebody already on the register. Does not approve them. */
export function linkIntake(id: Id, beneficiary: Id): Promise<IntakeRow> {
  return api.post<IntakeRow>(`/intakes/${id}/link`, { beneficiary, confirmed: true });
}

/** The populated programme, or null when the server sent a bare id. */
export function programmeOf(intake: IntakeRow): { _id: Id; name: string } | null {
  return intake.requestedProgramme && typeof intake.requestedProgramme === 'object'
    ? intake.requestedProgramme
    : null;
}

/** The populated beneficiary, or null when the server sent a bare id or nothing. */
export function beneficiaryOf(intake: IntakeRow): LinkedBeneficiary | null {
  return intake.linkedBeneficiary && typeof intake.linkedBeneficiary === 'object'
    ? intake.linkedBeneficiary
    : null;
}
