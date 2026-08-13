import { api } from './client';
import type { Id, IsoDate, Department, User } from '@/types/models';
import type { Paginated } from '@/types/api';
import type { AccessRequestStatus, Role } from '@/types/enums';

/*
 * The review side of staff onboarding.
 *
 * The submit side — the public form and its options — lives in auth.api.ts, because it is
 * an unauthenticated call and belongs with the other credential endpoints. Everything here
 * needs a session and one of two permissions.
 *
 * THE PIPELINE THIS SITS IN, because it is not obvious and it decides what the screen may
 * offer:
 *
 *   someone submits the public form   → a PENDING request, nothing else exists
 *   an approver approves it           → a User is created with status `invited`, and an
 *                                       activation link is emailed
 *   the person opens the link and     → accept-invite sets their password and moves the
 *   chooses a password                  account to `active`
 *
 * THERE IS NO STEP WHERE AN ADMIN SETS SOMEONE TO ACTIVE BY HAND, and that is the design
 * rather than a gap. An account only becomes usable when its owner has chosen a password
 * nobody else has seen; an administrator able to flip the switch could sign in as them.
 */

export interface AccessRequest {
  _id: Id;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  requestedRole: Role;
  /** Populated on this endpoint. */
  departmentId: Department | Id | null;
  motivation: string;
  status: AccessRequestStatus;
  reviewedBy: { _id: Id; name: string; role: Role } | Id | null;
  reviewedAt: IsoDate | null;
  /** What was actually granted, which may differ from what was asked for. */
  grantedRole: Role | null;
  decisionNote: string;
  /** The staff account approval created, once there is one. */
  createdUser: Pick<User, '_id' | 'name' | 'email' | 'role' | 'status'> | Id | null;
  createdAt: IsoDate;
}

export interface ListAccessRequestsQuery {
  page?: number;
  limit?: number;
  status?: AccessRequestStatus;
  search?: string;
  /** Oldest first by default, so the queue is answered in the order people applied. */
  sort?: 'createdAt' | '-createdAt';
}

export function listAccessRequests(
  query: ListAccessRequestsQuery = {},
  signal?: AbortSignal
): Promise<Paginated<AccessRequest>> {
  return api.list<AccessRequest>('/auth/access-requests', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

export interface ApproveAccessRequestInput {
  /** Omit to grant exactly what was asked for. */
  role?: Role;
  departmentId?: Id;
  note?: string;
}

/**
 * Approve, creating the staff account and emailing an activation link.
 *
 * Needs `access_request:review`, which is deliberately separate from `access_request:read`
 * — reading a queue of applicants and minting an account from it are different powers.
 *
 * The server additionally refuses to grant EXECUTIVE_DIRECTOR unless the approver is one;
 * the form mirrors that so the option is not offered rather than 403ing on submit.
 */
export function approveAccessRequest(
  id: Id,
  input: ApproveAccessRequestInput = {}
): Promise<{ request: AccessRequest; user: User; emailSent?: boolean }> {
  return api.post<{ request: AccessRequest; user: User; emailSent?: boolean }>(
    `/auth/access-requests/${id}/approve`,
    input
  );
}

/**
 * Reject. Terminal — an approver who changes their mind invites the person directly.
 *
 * @param reason required, and NOT internal: the applicant is emailed it. "No reason given"
 *   is not an answer to someone who asked to work here.
 */
export function rejectAccessRequest(id: Id, reason: string): Promise<AccessRequest> {
  return api.post<AccessRequest>(`/auth/access-requests/${id}/reject`, { reason });
}

/** The populated department, or null when the server sent a bare id. */
export function departmentOf(request: AccessRequest): Department | null {
  return request.departmentId && typeof request.departmentId === 'object'
    ? request.departmentId
    : null;
}
