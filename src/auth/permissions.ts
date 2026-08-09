import { ROLES } from '@/types/enums';
import type { Role } from '@/types/enums';

/*
 * Mirror of src/server/config/permissions.js.
 *
 * WHAT THIS IS FOR: deciding what to render. Hiding an "Approve" button the user cannot
 * use, and not linking to a page that would only 403.
 *
 * WHAT IT IS NOT: an access control decision. The server re-checks every request against
 * its own copy, so the worst a wrong entry here can do is show a button that fails or
 * hide one that would have worked. It can never expose data. Do not be tempted to skip
 * a server call because this said yes.
 *
 * It is also only half the story. A permission answers "may they call this route"; the
 * server additionally scopes *which rows* they see — coordinators to their programmes,
 * peer leaders and volunteers to records they captured. None of that is knowable here.
 *
 * Keep in step with the server file. A permission renamed there and not here silently
 * hides a feature from everyone who has it.
 */

export const PERMISSIONS = {
  USER_INVITE: 'user:invite',
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  USER_DISABLE: 'user:disable',
  ACCESS_REQUEST_READ: 'access_request:read',
  ACCESS_REQUEST_REVIEW: 'access_request:review',

  DEPARTMENT_CREATE: 'department:create',
  DEPARTMENT_READ: 'department:read',
  DEPARTMENT_UPDATE: 'department:update',

  BENEFICIARY_CREATE: 'beneficiary:create',
  BENEFICIARY_READ: 'beneficiary:read',
  /** Gates permit numbers and vulnerability flags. Exercising it writes an audit entry. */
  BENEFICIARY_READ_SENSITIVE: 'beneficiary:read_sensitive',
  BENEFICIARY_UPDATE: 'beneficiary:update',
  BENEFICIARY_VERIFY: 'beneficiary:verify',
  BENEFICIARY_DELETE: 'beneficiary:delete',

  DOCUMENT_CREATE: 'document:create',
  DOCUMENT_READ: 'document:read',
  /** Separate from read: listing that a permit scan exists is not fetching it. */
  DOCUMENT_DOWNLOAD: 'document:download',
  DOCUMENT_DELETE: 'document:delete',

  CASE_CREATE: 'case:create',
  CASE_READ: 'case:read',
  CASE_UPDATE: 'case:update',
  CASE_CLOSE: 'case:close',
  SERVICE_REQUEST_CREATE: 'service_request:create',
  SERVICE_REQUEST_READ: 'service_request:read',
  SERVICE_REQUEST_UPDATE: 'service_request:update',
  REFERRAL_CREATE: 'referral:create',
  REFERRAL_READ: 'referral:read',
  REFERRAL_UPDATE: 'referral:update',

  PROGRAMME_CREATE: 'programme:create',
  PROGRAMME_READ: 'programme:read',
  PROGRAMME_UPDATE: 'programme:update',
  ENROLLMENT_CREATE: 'enrollment:create',
  ENROLLMENT_READ: 'enrollment:read',
  ENROLLMENT_UPDATE: 'enrollment:update',
  /** Wider than enrollment:create — volunteers mark registers but cannot enrol anyone. */
  ATTENDANCE_CAPTURE: 'attendance:capture',
  EVENT_CREATE: 'event:create',
  EVENT_READ: 'event:read',
  EVENT_UPDATE: 'event:update',
  EDUCATION_CREATE: 'education:create',
  EDUCATION_READ: 'education:read',
  EDUCATION_UPDATE: 'education:update',

  BUDGET_CREATE: 'budget:create',
  BUDGET_READ: 'budget:read',
  BUDGET_APPROVE: 'budget:approve',
  TRANSACTION_CREATE: 'transaction:create',
  TRANSACTION_READ: 'transaction:read',
  TRANSACTION_APPROVE: 'transaction:approve',
  PETTY_CASH_CREATE: 'petty_cash:create',
  PETTY_CASH_READ: 'petty_cash:read',
  PETTY_CASH_RECONCILE: 'petty_cash:reconcile',

  DONOR_CREATE: 'donor:create',
  DONOR_READ: 'donor:read',
  CAMPAIGN_CREATE: 'campaign:create',
  CAMPAIGN_READ: 'campaign:read',
  CAMPAIGN_UPDATE: 'campaign:update',
  DONATION_CREATE: 'donation:create',
  DONATION_READ: 'donation:read',
  PLEDGE_MANAGE: 'pledge:manage',

  CHATBOARD_READ: 'chatboard:read',
  CHATBOARD_POST: 'chatboard:post',
  CHATBOARD_MANAGE: 'chatboard:manage',
  WHATSAPP_READ: 'whatsapp:read',
  REPORT_CREATE: 'report:create',
  REPORT_READ: 'report:read',
  METRIC_READ: 'metric:read',
  AUDIT_READ: 'audit:read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  /*
   * Oversight, and the approval half of every maker-checker pair. Holds no `*:create`
   * on finance — that omission IS the segregation of duties, not an oversight. Do not
   * "complete" this list.
   */
  EXECUTIVE_DIRECTOR: [
    P.USER_READ,
    P.USER_INVITE,
    P.ACCESS_REQUEST_READ,
    P.ACCESS_REQUEST_REVIEW,
    P.DEPARTMENT_CREATE,
    P.DEPARTMENT_READ,
    P.DEPARTMENT_UPDATE,
    P.BENEFICIARY_READ,
    P.BENEFICIARY_READ_SENSITIVE,
    P.CASE_READ,
    P.DOCUMENT_READ,
    P.DOCUMENT_DOWNLOAD,
    P.SERVICE_REQUEST_READ,
    P.REFERRAL_READ,
    P.PROGRAMME_READ,
    P.ENROLLMENT_READ,
    P.EVENT_READ,
    P.EDUCATION_READ,
    P.BUDGET_READ,
    P.BUDGET_APPROVE,
    P.TRANSACTION_READ,
    P.TRANSACTION_APPROVE,
    P.PETTY_CASH_READ,
    P.DONOR_READ,
    P.CAMPAIGN_READ,
    P.DONATION_READ,
    P.REPORT_READ,
    P.METRIC_READ,
    P.AUDIT_READ,
  ],

  ADMIN_OFFICER: [
    P.USER_INVITE,
    P.USER_READ,
    P.USER_UPDATE,
    P.USER_DISABLE,
    P.ACCESS_REQUEST_READ,
    P.ACCESS_REQUEST_REVIEW,
    P.DEPARTMENT_CREATE,
    P.DEPARTMENT_READ,
    P.DEPARTMENT_UPDATE,
    P.BENEFICIARY_CREATE,
    P.BENEFICIARY_READ,
    P.BENEFICIARY_READ_SENSITIVE,
    P.BENEFICIARY_UPDATE,
    P.BENEFICIARY_VERIFY,
    P.BENEFICIARY_DELETE,
    P.TRANSACTION_READ,
    P.TRANSACTION_APPROVE,
    P.DOCUMENT_CREATE,
    P.DOCUMENT_READ,
    P.DOCUMENT_DOWNLOAD,
    P.DOCUMENT_DELETE,
    P.CASE_CREATE,
    P.CASE_READ,
    P.CASE_UPDATE,
    P.CASE_CLOSE,
    P.SERVICE_REQUEST_CREATE,
    P.SERVICE_REQUEST_READ,
    P.SERVICE_REQUEST_UPDATE,
    P.REFERRAL_CREATE,
    P.REFERRAL_READ,
    P.REFERRAL_UPDATE,
    P.PROGRAMME_READ,
    P.ENROLLMENT_READ,
    P.WHATSAPP_READ,
    P.REPORT_READ,
    P.AUDIT_READ,
    P.CHATBOARD_READ,
    P.CHATBOARD_POST,
    P.CHATBOARD_MANAGE,
  ],

  /** Everything here is further narrowed to their assigned programmes, server-side. */
  PROJECT_COORDINATOR: [
    P.DEPARTMENT_READ,
    P.BENEFICIARY_CREATE,
    P.BENEFICIARY_READ,
    P.BENEFICIARY_UPDATE,
    P.DOCUMENT_CREATE,
    P.DOCUMENT_READ,
    P.DOCUMENT_DOWNLOAD,
    P.CASE_CREATE,
    P.CASE_READ,
    P.CASE_UPDATE,
    P.CASE_CLOSE,
    P.SERVICE_REQUEST_CREATE,
    P.SERVICE_REQUEST_READ,
    P.SERVICE_REQUEST_UPDATE,
    P.REFERRAL_CREATE,
    P.REFERRAL_READ,
    P.REFERRAL_UPDATE,
    P.PROGRAMME_CREATE,
    P.PROGRAMME_READ,
    P.PROGRAMME_UPDATE,
    P.ENROLLMENT_CREATE,
    P.ENROLLMENT_READ,
    P.ENROLLMENT_UPDATE,
    P.ATTENDANCE_CAPTURE,
    P.EVENT_CREATE,
    P.EVENT_READ,
    P.EVENT_UPDATE,
    P.EDUCATION_CREATE,
    P.EDUCATION_READ,
    P.EDUCATION_UPDATE,
    P.BUDGET_READ,
    P.TRANSACTION_READ,
    P.TRANSACTION_APPROVE,
    P.REPORT_READ,
    P.CHATBOARD_READ,
    P.CHATBOARD_POST,
    P.CHATBOARD_MANAGE,
  ],

  /** Originates spend; cannot approve any of it, including their own petty cash float. */
  FINANCE_OFFICER: [
    P.DEPARTMENT_READ,
    P.BUDGET_CREATE,
    P.BUDGET_READ,
    P.TRANSACTION_CREATE,
    P.TRANSACTION_READ,
    P.PETTY_CASH_CREATE,
    P.PETTY_CASH_READ,
    P.PETTY_CASH_RECONCILE,
    P.DONOR_CREATE,
    P.DONOR_READ,
    P.CAMPAIGN_READ,
    P.DONATION_CREATE,
    P.DONATION_READ,
    P.PLEDGE_MANAGE,
    P.REPORT_READ,
    P.METRIC_READ,
  ],

  /** No beneficiary access at all: marketing works from metrics, never identities. */
  COMMS_OFFICER: [
    P.DEPARTMENT_READ,
    P.CAMPAIGN_CREATE,
    P.CAMPAIGN_READ,
    P.CAMPAIGN_UPDATE,
    P.DONOR_READ,
    P.DONATION_READ,
    P.PLEDGE_MANAGE,
    P.EVENT_CREATE,
    P.EVENT_READ,
    P.EVENT_UPDATE,
    P.CHATBOARD_READ,
    P.CHATBOARD_POST,
    P.CHATBOARD_MANAGE,
    P.REPORT_READ,
    P.METRIC_READ,
  ],

  /** Reads the register to compute indicators, but never the sensitive fields. */
  ME_OFFICER: [
    P.DEPARTMENT_READ,
    P.ACCESS_REQUEST_READ,
    P.BENEFICIARY_READ,
    P.CASE_READ,
    P.PROGRAMME_READ,
    P.ENROLLMENT_READ,
    P.EVENT_READ,
    P.EDUCATION_READ,
    P.REPORT_CREATE,
    P.REPORT_READ,
    P.METRIC_READ,
    P.AUDIT_READ,
  ],

  /** Community members. Server-side, they see only records they captured themselves. */
  PEER_LEADER: [
    P.BENEFICIARY_CREATE,
    P.BENEFICIARY_READ,
    P.BENEFICIARY_UPDATE,
    P.DOCUMENT_CREATE,
    P.DOCUMENT_READ,
    P.CASE_CREATE,
    P.CASE_READ,
    P.SERVICE_REQUEST_CREATE,
    P.SERVICE_REQUEST_READ,
    P.ENROLLMENT_READ,
    P.ATTENDANCE_CAPTURE,
    P.CHATBOARD_READ,
    P.CHATBOARD_POST,
  ],

  VOLUNTEER: [
    P.BENEFICIARY_CREATE,
    P.BENEFICIARY_READ,
    P.ENROLLMENT_READ,
    P.ATTENDANCE_CAPTURE,
    P.CHATBOARD_READ,
    P.CHATBOARD_POST,
  ],
};

/**
 * Pre-built sets, so a permission check inside a render loop is O(1).
 *
 * Built by walking ROLES rather than Object.entries, which widens the key back to
 * `string` and needs an unsound cast to narrow again. Iterating the known list keeps
 * every lookup below type-checked, and adding a role to ROLES without a matching entry
 * in ROLE_PERMISSIONS becomes a compile error rather than a silent empty set.
 */
const PERMISSION_SETS = ((): Record<Role, ReadonlySet<Permission>> => {
  // The one assertion: an accumulator cannot be complete until the loop has run.
  const sets = {} as Record<Role, ReadonlySet<Permission>>;
  for (const role of ROLES) sets[role] = new Set(ROLE_PERMISSIONS[role]);
  return sets;
})();

export function roleHasPermission(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return PERMISSION_SETS[role]?.has(permission) ?? false;
}

export function permissionsForRole(role: Role | undefined): Permission[] {
  if (!role) return [];
  return [...(PERMISSION_SETS[role] ?? [])];
}
