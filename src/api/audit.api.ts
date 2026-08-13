import { api } from './client';
import type { Id, IsoDate } from '@/types/models';
import type { Paginated } from '@/types/api';
import type { CaseCaseworker } from './cases.api';

/*
 * The /audit endpoints, typed.
 *
 * READ-ONLY BY CONSTRUCTION. AuditLog blocks every update and delete at the model layer,
 * so there is no write route to call and there never should be. Entries are appended by
 * the services that do the work; nothing here creates one.
 *
 * THE TRAIL IS NOT SCOPED TO A CASELOAD, unlike every other list in this app. It answers
 * "who accessed whose record", which is only useful if it covers everyone — which is why
 * audit:read is held by three office roles and nobody in the field.
 *
 * READING IT IS DELIBERATELY NOT ITSELF AUDITED. One entry per page view would bury the
 * events an auditor came to find.
 */

export interface AuditEntry {
  _id: Id;
  /**
   * Null for a system or anonymous actor — a failed login for an unknown email, or an
   * access request submitted by someone with no account yet.
   */
  actor: CaseCaseworker | Id | null;
  action: string;
  status: 'success' | 'failure';
  targetType: string | null;
  /** Either an internal ObjectId or an external provider reference. */
  targetId: string | null;
  ip: string;
  userAgent: string;
  /**
   * References only — who, what type, which record. POPIA: this never carries permit
   * numbers, ID numbers or document contents, by construction at the writing end.
   */
  meta: Record<string, unknown>;
  createdAt: IsoDate;
}

export interface ListAuditQuery {
  page?: number;
  limit?: number;
  actor?: Id;
  /** Must be one of the known actions — the server rejects anything else. */
  action?: string;
  targetType?: string;
  targetId?: string;
  status?: 'success' | 'failure';
  from?: string;
  to?: string;
  sort?: 'createdAt' | '-createdAt';
}

export function listAuditEntries(
  query: ListAuditQuery = {},
  signal?: AbortSignal
): Promise<Paginated<AuditEntry>> {
  return api.list<AuditEntry>('/audit', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

/**
 * The full action vocabulary.
 *
 * Fetched rather than hard-coded so the filter is built from the same source of truth the
 * writers use — a list copied into the client drifts the first time an action is added.
 */
export function listAuditActions(signal?: AbortSignal): Promise<string[]> {
  return api.get<string[]>('/audit/actions', { signal });
}

/** The populated shape, or null when the actor was a system or anonymous one. */
export function actorOf(entry: AuditEntry): CaseCaseworker | null {
  return entry.actor && typeof entry.actor === 'object' ? entry.actor : null;
}
