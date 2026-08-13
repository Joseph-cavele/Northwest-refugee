import { api } from './client';
import type { Id, IsoDate } from '@/types/models';
import type { Paginated } from '@/types/api';
import type {
  ProgrammePillar,
  ServiceCategory,
  ServiceRequestStatus,
  IntakeChannel,
  UrgencyLevel,
} from '@/types/enums';
import type { CaseBeneficiary, CaseCaseworker } from './cases.api';

/*
 * The /service-requests endpoints, typed.
 *
 * A service request is ONE thing a beneficiary asked for — a food parcel, a permit
 * renewal, a school place. A case is the ongoing relationship those asks sit inside. The
 * distinction matters on screen: a case is owned, a request is due.
 */

/**
 * Which statuses are reachable from which, mirroring TRANSITIONS in
 * serviceRequest.model.js. Kept here so the UI can offer only the moves the server will
 * accept — the server still refuses an invalid one with a 409 naming the alternatives, and
 * this table can never widen what is allowed, only narrow what is shown.
 *
 * RESOLVED, REFERRED and CANCELLED are terminal and stay that way. Reopening is refused by
 * design: a request that can be resolved twice inflates every throughput figure reported to
 * a funder, and the honest record of a recurring need is a second request.
 */
export const STATUS_TRANSITIONS: Record<ServiceRequestStatus, readonly ServiceRequestStatus[]> = {
  OPEN: ['IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'REFERRED', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'RESOLVED', 'REFERRED', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'RESOLVED', 'REFERRED', 'CANCELLED'],
  RESOLVED: [],
  REFERRED: [],
  CANCELLED: [],
};

export interface ServiceRequestRow {
  _id: Id;
  /** What a caseworker quotes: `SR-…`. Distinct from the beneficiary's reference code. */
  reference: string;
  /** Populated by the list endpoint, or a bare id if it ever stops being. */
  beneficiary: CaseBeneficiary | Id | null;
  assignedTo: CaseCaseworker | Id | null;

  category: ServiceCategory;
  /**
   * Snapshotted from the category when the request was raised, never re-derived —
   * re-mapping a category later must not silently rewrite historical reporting.
   */
  pillar: ProgrammePillar;
  description: string;

  urgency: UrgencyLevel;
  status: ServiceRequestStatus;
  /**
   * Derived from urgency at creation (URGENT 1 day · HIGH 3 · NORMAL 7 · LOW 14) and stored
   * as a real date, so the overdue queue is an index lookup rather than a scan.
   */
  dueAt: IsoDate | null;
  channel: IntakeChannel;

  /** Server-computed: past due AND still workable. False for any terminal status. */
  isOverdue: boolean;
  isTerminal: boolean;

  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface ListServiceRequestsQuery {
  page?: number;
  limit?: number;
  beneficiary?: Id;
  status?: ServiceRequestStatus;
  category?: ServiceCategory;
  urgency?: UrgencyLevel;
  assignedTo?: Id;
  /** The caseworker's own queue, without having to know their own id. */
  mine?: boolean;
  /** Past due and still open — the queue that matters most. */
  overdue?: boolean;
  /** Excludes terminal states, so "what is still on my desk" is one flag. */
  openOnly?: boolean;
  /** Defaults to `dueAt` server-side: soonest deadline first, which is the queue order. */
  sort?: 'dueAt' | '-dueAt' | 'createdAt' | '-createdAt';
}

/**
 * A page of requests. Rows are scoped server-side — peer leaders and volunteers see only
 * the ones they raised — so a total here is a total of what this user may see.
 */
export function listServiceRequests(
  query: ListServiceRequestsQuery = {},
  signal?: AbortSignal
): Promise<Paginated<ServiceRequestRow>> {
  return api.list<ServiceRequestRow>('/service-requests', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

export interface TransitionInput {
  status: ServiceRequestStatus;
  /** Required by the server for RESOLVED and CANCELLED. */
  notes?: string;
  /** Required by the server for REFERRED — the onward organisation lives on the referral. */
  referral?: Id;
}

/**
 * Move a request to another status.
 *
 * Its own endpoint rather than a field on PATCH, so an invalid jump is refused with a 409
 * that names the available transitions instead of being written silently.
 */
export function transitionServiceRequest(
  id: Id,
  input: TransitionInput
): Promise<ServiceRequestRow> {
  return api.post<ServiceRequestRow>(`/service-requests/${id}/status`, input);
}

/** The populated shape, or null when the server sent a bare id. */
export function beneficiaryOfRequest(row: ServiceRequestRow): CaseBeneficiary | null {
  return row.beneficiary && typeof row.beneficiary === 'object' ? row.beneficiary : null;
}

export function assigneeOfRequest(row: ServiceRequestRow): CaseCaseworker | null {
  return row.assignedTo && typeof row.assignedTo === 'object' ? row.assignedTo : null;
}
