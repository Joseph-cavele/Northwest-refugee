import { api } from './client';
import type { Id, IsoDate } from '@/types/models';
import type { Paginated } from '@/types/api';
import type { ServiceCategory, UrgencyLevel } from '@/types/enums';

/*
 * The /cases endpoints, typed.
 *
 * A case is the ongoing file one staff member owns for one beneficiary; a service request
 * is a single ask inside it.
 */

export const CASE_STATUSES = ['OPEN', 'ON_HOLD', 'CLOSED'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  OPEN: 'Open',
  ON_HOLD: 'On hold',
  CLOSED: 'Closed',
};

/**
 * What the list endpoint populates — name and role for the caseworker, reference code and
 * name for the beneficiary. Never the whole record: a list does not need, and must not
 * carry, a person's contact details or immigration status.
 */
export interface CaseCaseworker {
  _id: Id;
  name: string;
  role: string;
}

export interface CaseBeneficiary {
  _id: Id;
  referenceCode: string;
  firstName: string;
  lastName: string;
  status: string;
}

export interface CaseRow {
  _id: Id;
  caseNumber: string;
  beneficiary: CaseBeneficiary | Id | null;
  caseworker: CaseCaseworker | Id | null;
  category: ServiceCategory;
  priority: UrgencyLevel;
  status: CaseStatus;
  summary: string;
  openedAt: IsoDate;
  /** Derived server-side: whole days the file has been open. */
  ageDays: number;
  isEscalated: boolean;
}

export interface ListCasesQuery {
  page?: number;
  limit?: number;
  status?: CaseStatus;
  category?: ServiceCategory;
  priority?: UrgencyLevel;
  /** Every case ever opened for one person, including closed ones. */
  beneficiary?: Id;
  caseworker?: Id;
  /** My caseload, without having to know my own id. */
  mine?: boolean;
  /** HIGH or URGENT and still workable. A closed case is never urgent. */
  urgent?: boolean;
  /** Excludes closed files. */
  openOnly?: boolean;
  sort?: 'openedAt' | '-openedAt' | 'priority' | '-priority';
}

/**
 * A page of cases, with the totals a pager needs.
 *
 * Returns the envelope rather than bare rows because `GET /cases` is paginated and always
 * was — `api.get` simply threw `meta` away, so a caller could render rows but could never
 * say how many there were or offer a second page.
 *
 * Rows are scoped server-side: a volunteer sees only files they captured, a coordinator
 * only their programmes. A total here is a total of what this user may see.
 */
export function listCases(
  query: ListCasesQuery = {},
  signal?: AbortSignal
): Promise<Paginated<CaseRow>> {
  return api.list<CaseRow>('/cases', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

/**
 * HIGH or URGENT and still open, oldest first.
 *
 * A thin alias over the same scoped list rather than a separate query, so the queue can
 * never show a case the caller would not be allowed to open.
 */
export function listUrgentCases(
  query: ListCasesQuery = {},
  signal?: AbortSignal
): Promise<Paginated<CaseRow>> {
  return api.list<CaseRow>('/cases/urgent', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

/** The populated shape, or null when the server sent a bare id. */
export function beneficiaryOf(row: CaseRow): CaseBeneficiary | null {
  return row.beneficiary && typeof row.beneficiary === 'object' ? row.beneficiary : null;
}

export function caseworkerOf(row: CaseRow): CaseCaseworker | null {
  return row.caseworker && typeof row.caseworker === 'object' ? row.caseworker : null;
}
