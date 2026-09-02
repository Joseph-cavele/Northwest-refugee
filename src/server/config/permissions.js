import AppError from '../utils/AppError.js';
import { ROLES } from './constants.js';

// The single source of truth for who can do what. Routes declare a permission —
// `authorize('transaction:approve')` — and never a role name, so re-tuning the matrix
// here never means touching a route file.
//
// Permission strings are `resource:action`. They are an internal contract: renaming one
// silently un-guards every route that still uses the old string, which is why
// assertKnownPermission() exists and why authorize() calls it at wire-up time.

export const PERMISSIONS = Object.freeze({
  // --- staff accounts ---
  USER_INVITE: 'user:invite',
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  USER_DISABLE: 'user:disable',

  // Reading a queue of applicants is not the same as deciding on one: an M&E or comms
  // officer may need to see that hiring is in progress without being able to mint an
  // account. Approving is what creates a login, so it is held with USER_INVITE.
  ACCESS_REQUEST_READ: 'access_request:read',
  ACCESS_REQUEST_REVIEW: 'access_request:review',

  // --- departments ---
  DEPARTMENT_CREATE: 'department:create',
  DEPARTMENT_READ: 'department:read',
  DEPARTMENT_UPDATE: 'department:update',

  // --- beneficiaries ---
  BENEFICIARY_CREATE: 'beneficiary:create',
  BENEFICIARY_READ: 'beneficiary:read',
  // Gates immigration.permitNumber and vulnerabilityFlags. Every grant of this
  // permission that is exercised writes an audit entry (recordSensitiveRead).
  BENEFICIARY_READ_SENSITIVE: 'beneficiary:read_sensitive',
  BENEFICIARY_UPDATE: 'beneficiary:update',
  BENEFICIARY_VERIFY: 'beneficiary:verify',
  // Soft delete only — the record is retained and the case history preserved. Held by the
  // Admin Officer alone: a coordinator or peer leader removing someone from the register
  // would silently end their access to services.
  BENEFICIARY_DELETE: 'beneficiary:delete',

  // --- documents ---
  DOCUMENT_CREATE: 'document:create',
  DOCUMENT_READ: 'document:read',
  // Separate from read: listing that a permit scan exists is not the same as fetching it.
  DOCUMENT_DOWNLOAD: 'document:download',
  // Soft delete only. Admin Officer alone — removing the evidence behind a case file is
  // not something a volunteer or coordinator should be able to do.
  DOCUMENT_DELETE: 'document:delete',

  // --- casework ---
  // A case is the ongoing file a staff member owns for one beneficiary; a service request
  // is a single ask inside it. Closing is its own permission because a closed case drops
  // out of every active-caseload figure.
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

  // --- programmes ---
  PROGRAMME_CREATE: 'programme:create',
  PROGRAMME_READ: 'programme:read',
  PROGRAMME_UPDATE: 'programme:update',
  ENROLLMENT_CREATE: 'enrollment:create',
  ENROLLMENT_READ: 'enrollment:read',
  ENROLLMENT_UPDATE: 'enrollment:update',
  ATTENDANCE_CAPTURE: 'attendance:capture',
  /*
   * Intake and screening.
   *
   * SCREENING_DECIDE IS SEPARATE FROM SCREENING_CONDUCT, and that separation is the control
   * this module rests on: conducting a screening is asking somebody questions and writing
   * down the answers, while deciding is the act that creates a register record for a person
   * or refuses them one. A peer leader at the desk can do the first. The second is a
   * judgement the organisation is answerable for.
   */
  INTAKE_CREATE: 'intake:create',
  INTAKE_READ: 'intake:read',
  INTAKE_UPDATE: 'intake:update',
  SCREENING_CONDUCT: 'screening:conduct',
  SCREENING_DECIDE: 'screening:decide',
  SCREENING_TEMPLATE_MANAGE: 'screening_template:manage',

  EVENT_CREATE: 'event:create',
  EVENT_READ: 'event:read',
  EVENT_UPDATE: 'event:update',
  /*
   * Publishing is its own permission, separate from event:update, because it is a
   * different act with a different audience. Editing changes an internal record;
   * publishing puts a time, a place and an invitation on a public website read by
   * people who may then travel across Rustenburg to attend. The roles that plan
   * events are not automatically the role answerable for what NWHR says in public.
   */
  EVENT_PUBLISH: 'event:publish',
  /*
   * A soft delete, and still the narrowest of the four: an event carries an
   * attendance register, and a register is the evidence a funder is shown.
   */
  EVENT_DELETE: 'event:delete',
  EDUCATION_CREATE: 'education:create',
  EDUCATION_READ: 'education:read',
  EDUCATION_UPDATE: 'education:update',

  // --- finance (maker-checker: create and approve never sit with the same role) ---
  BUDGET_CREATE: 'budget:create',
  BUDGET_READ: 'budget:read',
  BUDGET_APPROVE: 'budget:approve',
  TRANSACTION_CREATE: 'transaction:create',
  TRANSACTION_READ: 'transaction:read',
  TRANSACTION_APPROVE: 'transaction:approve',
  PETTY_CASH_CREATE: 'petty_cash:create',
  PETTY_CASH_READ: 'petty_cash:read',
  PETTY_CASH_RECONCILE: 'petty_cash:reconcile',

  // --- fundraising ---
  DONOR_CREATE: 'donor:create',
  DONOR_READ: 'donor:read',
  CAMPAIGN_CREATE: 'campaign:create',
  CAMPAIGN_READ: 'campaign:read',
  CAMPAIGN_UPDATE: 'campaign:update',
  // Recording an offline gift (cash, EFT). Gateway settlements arrive through the
  // payments webhook, not through a person.
  DONATION_CREATE: 'donation:create',
  DONATION_READ: 'donation:read',
  PLEDGE_MANAGE: 'pledge:manage',

  // --- comms & reporting ---
  CHATBOARD_READ: 'chatboard:read',
  CHATBOARD_POST: 'chatboard:post',
  // Creating, renaming and archiving channels, and removing anyone's message. Separate
  // from posting so a volunteer cannot delete a coordinator's post.
  CHATBOARD_MANAGE: 'chatboard:manage',
  WHATSAPP_READ: 'whatsapp:read',
  REPORT_CREATE: 'report:create',
  REPORT_READ: 'report:read',
  METRIC_READ: 'metric:read',
  AUDIT_READ: 'audit:read',
});

const P = PERMISSIONS;

export const ROLE_PERMISSIONS = Object.freeze({
  // Oversight and the approval half of every maker-checker pair. Holds no `*:create`
  // on finance — that omission is the segregation of duties, not an oversight.
  [ROLES.EXECUTIVE_DIRECTOR]: [
    // Reads applications and decides them; owns the screening forms. Does not capture
    // intakes, which is desk work.
    P.INTAKE_READ,
    P.SCREENING_CONDUCT,
    P.SCREENING_DECIDE,
    P.SCREENING_TEMPLATE_MANAGE,
    P.USER_READ,
    // The ED holds the invite-adjacent permissions the Admin Officer has, so onboarding
    // does not stall when there is no Admin Officer in post.
    P.USER_INVITE,
    P.ACCESS_REQUEST_READ,
    P.ACCESS_REQUEST_REVIEW,
    P.DEPARTMENT_CREATE,
    P.DEPARTMENT_READ,
    P.DEPARTMENT_UPDATE,
    P.BENEFICIARY_READ,
    P.CASE_READ,
    P.BENEFICIARY_READ_SENSITIVE,
    // Same reasoning as USER_INVITE above: intake must not stall when there is no Admin
    // Officer in post, and an unverified beneficiary is somebody waiting for services.
    // NOT a general widening — the finance omissions below are untouched and stay that way.
    P.BENEFICIARY_VERIFY,
    P.DOCUMENT_READ,
    P.DOCUMENT_DOWNLOAD,
    P.SERVICE_REQUEST_READ,
    P.REFERRAL_READ,
    P.PROGRAMME_READ,
    P.ENROLLMENT_READ,
    P.EVENT_READ,
    // The full set on events: the director is the role answerable for what appears on
    // the organisation's public site, and publish and delete live nowhere else by default.
    P.EVENT_CREATE,
    P.EVENT_UPDATE,
    P.EVENT_PUBLISH,
    P.EVENT_DELETE,
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

  [ROLES.ADMIN_OFFICER]: [
    P.INTAKE_CREATE,
    P.INTAKE_READ,
    P.INTAKE_UPDATE,
    P.SCREENING_CONDUCT,
    P.SCREENING_DECIDE,
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

  // Everything below is narrowed to their assigned programmes by scopeToProgrammes().
  [ROLES.PROJECT_COORDINATOR]: [
    P.INTAKE_CREATE,
    P.INTAKE_READ,
    P.INTAKE_UPDATE,
    P.SCREENING_CONDUCT,
    P.SCREENING_DECIDE,
    // Owns the questions asked for their own programmes.
    P.SCREENING_TEMPLATE_MANAGE,
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

  // Originates spend; cannot approve any of it, including their own petty cash float.
  [ROLES.FINANCE_OFFICER]: [
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

  // No beneficiary access at all: marketing works from metrics, never identities.
  [ROLES.COMMS_OFFICER]: [
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
    // Comms is the role whose job is what the organisation says in public, so the
    // publish switch belongs here as well as with the director. Delete does not.
    P.EVENT_PUBLISH,
    P.CHATBOARD_READ,
    P.CHATBOARD_POST,
    P.CHATBOARD_MANAGE,
    P.REPORT_READ,
    P.METRIC_READ,
  ],

  // Reads the register to compute indicators, but never the sensitive fields.
  [ROLES.ME_OFFICER]: [
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

  // Community members, not office staff — scopeToProgrammes() restricts them to the
  // records they captured themselves.
  [ROLES.PEER_LEADER]: [
    // Takes applications and asks the questions. NOT screening:decide — refusing somebody a
    // place on the register is not a peer leader's call to make.
    P.INTAKE_CREATE,
    P.INTAKE_READ,
    P.SCREENING_CONDUCT,
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

  [ROLES.VOLUNTEER]: [
    // Can write down that somebody came in, and nothing beyond that.
    P.INTAKE_CREATE,
    P.INTAKE_READ,
    P.BENEFICIARY_CREATE,
    P.BENEFICIARY_READ,
    P.ENROLLMENT_READ,
    P.ATTENDANCE_CAPTURE,
    P.CHATBOARD_READ,
    P.CHATBOARD_POST,
  ],
});

// Pre-built sets for O(1) lookup on every guarded request.
const PERMISSION_SETS = Object.freeze(
  Object.fromEntries(
    Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => [role, new Set(perms)])
  )
);

export const ALL_PERMISSIONS = Object.freeze(new Set(Object.values(PERMISSIONS)));

/**
 * Fail fast on a permission string that no role could ever hold. Without this a typo in
 * a route guard reads as "nobody is allowed", which looks like a broken login rather
 * than a broken string.
 */
export function assertKnownPermission(permission) {
  if (!ALL_PERMISSIONS.has(permission)) {
    throw new Error(`Unknown permission "${permission}" — add it to config/permissions.js`);
  }
  return permission;
}

export function hasPermission(role, permission) {
  return PERMISSION_SETS[role]?.has(permission) ?? false;
}

export function permissionsForRole(role) {
  return [...(PERMISSION_SETS[role] ?? [])];
}

/**
 * Every role holding a permission — the inverse lookup, used to decide who to notify.
 *
 * Addressing a notification to "whoever can review access requests" rather than to a
 * hard-coded ADMIN_OFFICER keeps this matrix the single source of truth: re-tuning the
 * grants above re-routes the alerts with it, instead of leaving a queue nobody is told
 * about.
 */
export function rolesWithPermission(permission) {
  assertKnownPermission(permission);
  return Object.keys(PERMISSION_SETS).filter((role) => PERMISSION_SETS[role].has(permission));
}

// --- row-level scoping -----------------------------------------------------
// A permission answers "may they call this route". These answer "which rows". Both are
// required: a route guard on its own leaves the rest of the register one curl away.

// Coordinators see their assigned programmes; peer leaders and volunteers see only what
// they captured. Every other role reads across the organisation.
const PROGRAMME_SCOPED = new Set([ROLES.PROJECT_COORDINATOR]);
const OWN_RECORDS_ONLY = new Set([ROLES.PEER_LEADER, ROLES.VOLUNTEER]);

export function isProgrammeScoped(role) {
  return PROGRAMME_SCOPED.has(role);
}

export function isOwnRecordsOnly(role) {
  return OWN_RECORDS_ONLY.has(role);
}

/**
 * Narrow a Mongoose filter to the rows `user` may see. Merge it into every beneficiary,
 * enrolment and casework query rather than trusting the route guard alone:
 *
 *   const filter = scopeToProgrammes(req.user, { status: 'ACTIVE' });
 *
 * A programme-scoped user with no programmes assigned yet matches nothing — an empty
 * `$in` is the correct answer, not an open query.
 */
export function scopeToProgrammes(
  user,
  filter = {},
  { programmeField = 'programme', capturedByField = 'capturedBy' } = {}
) {
  if (!user) throw AppError.unauthorized();

  if (isOwnRecordsOnly(user.role)) {
    return { ...filter, [capturedByField]: user._id };
  }

  if (isProgrammeScoped(user.role)) {
    return { ...filter, [programmeField]: { $in: user.programmes ?? [] } };
  }

  return { ...filter };
}

/**
 * Guard a single programme id before acting on it — the write-side counterpart to
 * scopeToProgrammes, for routes that take a programme in the body or params.
 */
export function assertProgrammeAccess(user, programmeId) {
  if (!user) throw AppError.unauthorized();
  if (!isProgrammeScoped(user.role)) return;

  const assigned = (user.programmes ?? []).map(String);
  if (!assigned.includes(String(programmeId))) {
    throw AppError.forbidden('You are not assigned to that programme');
  }
}
