import mongoose from 'mongoose';
import logger from '../../config/logger.js';

const { Schema } = mongoose;

// Append-only trail of every consequential action, denials included.
// POPIA: `meta` must never carry permit numbers, ID numbers or document contents — store
// references (who, what type, which record id), never the sensitive payload itself.

export const ACTIONS = Object.freeze({
  // Accounts & auth
  USER_INVITED: 'user.invited',
  USER_INVITE_ACCEPTED: 'user.invite_accepted',
  USER_UPDATED: 'user.updated',
  USER_DISABLED: 'user.disabled',
  // Self-service edits to one's own record, kept apart from USER_UPDATED so an auditor can
  // tell "the Admin Officer changed this account" from "the owner changed their own".
  PROFILE_UPDATED: 'user.profile_updated',
  PASSWORD_CHANGED: 'auth.password_changed',

  // Staff onboarding. SUBMITTED is written for an anonymous actor — nobody is signed in
  // when the form is filled, which is why AuditLog.actor is nullable.
  ACCESS_REQUEST_SUBMITTED: 'access_request.submitted',
  ACCESS_REQUEST_APPROVED: 'access_request.approved',
  ACCESS_REQUEST_REJECTED: 'access_request.rejected',

  DEPARTMENT_CREATED: 'department.created',
  DEPARTMENT_UPDATED: 'department.updated',

  // The classification model's monthly spend ceiling was reached and it was switched off.
  // Recorded as a failure so it stands out in the trail: it is a degradation, not routine.
  AI_BUDGET_EXCEEDED: 'ai.budget_exceeded',
  LOGIN_SUCCEEDED: 'auth.login_succeeded',
  LOGIN_FAILED: 'auth.login_failed',
  ACCOUNT_LOCKED: 'auth.account_locked',
  LOGOUT: 'auth.logout',
  MFA_ENROLLED: 'auth.mfa_enrolled',
  MFA_CHALLENGE_PASSED: 'auth.mfa_challenge_passed',
  MFA_CHALLENGE_FAILED: 'auth.mfa_challenge_failed',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'auth.password_reset_completed',
  TOKEN_REFRESHED: 'auth.token_refreshed',
  REFRESH_REUSE_DETECTED: 'auth.refresh_reuse_detected',
  SESSION_REVOKED: 'auth.session_revoked',
  PERMISSION_DENIED: 'auth.permission_denied',

  // Domain
  BENEFICIARY_CREATED: 'beneficiary.created',
  BENEFICIARY_UPDATED: 'beneficiary.updated',
  BENEFICIARY_ASSIGNED: 'beneficiary.assigned',
  // Reading a permit number or a vulnerability flag is itself an auditable event.
  SENSITIVE_READ: 'beneficiary.sensitive_read',
  CONSENT_GIVEN: 'beneficiary.consent_given',
  CONSENT_WITHDRAWN: 'beneficiary.consent_withdrawn',
  EVENT_CREATED: 'event.created',
  EVENT_UPDATED: 'event.updated',
  EVENT_PARTICIPANTS_RECORDED: 'event.participants_recorded',
  ENROLLED: 'enrollment.created',
  ENROLLMENT_UPDATED: 'enrollment.updated',
  ATTENDANCE_CAPTURED: 'attendance.captured',
  SCHOOL_PLACEMENT_CREATED: 'school_placement.created',
  SCHOOL_PLACEMENT_UPDATED: 'school_placement.updated',
  COOPERATIVE_CREATED: 'cooperative.created',
  COOPERATIVE_UPDATED: 'cooperative.updated',
  PROGRAMME_CREATED: 'programme.created',
  PROGRAMME_UPDATED: 'programme.updated',
  PROGRAMME_ARCHIVED: 'programme.archived',
  COHORT_CREATED: 'cohort.created',
  COHORT_UPDATED: 'cohort.updated',
  SESSION_SCHEDULED: 'session.scheduled',
  SESSION_UPDATED: 'session.updated',
  CASE_OPENED: 'case.opened',
  CASE_UPDATED: 'case.updated',
  CASE_ASSIGNED: 'case.assigned',
  CASE_CLOSED: 'case.closed',
  SERVICE_REQUEST_CREATED: 'service_request.created',
  SERVICE_REQUEST_UPDATED: 'service_request.updated',
  SERVICE_REQUEST_ASSIGNED: 'service_request.assigned',
  SERVICE_REQUEST_STATUS_CHANGED: 'service_request.status_changed',
  // An outbound referral is a disclosure to a third party, so its creation is an
  // auditable event in its own right — not merely a case note.
  REFERRAL_CREATED: 'referral.created',
  REFERRAL_UPDATED: 'referral.updated',
  REFERRAL_STATUS_CHANGED: 'referral.status_changed',
  FINANCE_CREATED: 'finance.created',
  FINANCE_SUBMITTED: 'finance.submitted',
  FINANCE_APPROVED: 'finance.approved',
  FINANCE_REJECTED: 'finance.rejected',
  FINANCE_REVERSED: 'finance.reversed',
  PETTY_CASH_MOVEMENT: 'petty_cash.movement',
  PETTY_CASH_RECONCILED: 'petty_cash.reconciled',
  DONOR_CREATED: 'donor.created',
  DONOR_UPDATED: 'donor.updated',
  CAMPAIGN_CREATED: 'campaign.created',
  CAMPAIGN_UPDATED: 'campaign.updated',
  PLEDGE_CREATED: 'pledge.created',
  PLEDGE_UPDATED: 'pledge.updated',
  DONATION_RECORDED: 'donation.recorded',
  DONATION_SETTLED: 'donation.settled',
  DONATION_RECEIPT_SENT: 'donation.receipt_sent',
  DONATION_REFUNDED: 'donation.refunded',
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_DOWNLOADED: 'document.downloaded',
  DOCUMENT_DELETED: 'document.deleted',
});

const auditLogSchema = new Schema(
  {
    // Null for system or anonymous actors (a failed login for an unknown email).
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    action: { type: String, enum: Object.values(ACTIONS), required: true, index: true },
    status: { type: String, enum: ['success', 'failure'], default: 'success' },
    targetType: { type: String, default: null },
    // Mixed so this can reference either an internal ObjectId or an external provider ref.
    targetId: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  // Audit rows are immutable — an updatedAt would be a lie.
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

// Append-only, enforced at the model layer so no service can bypass it. Block edits to
// existing docs...
//
// Mongoose 9 removed callback-style middleware: a hook is called with the wrapped
// function's arguments only, never a `next`. Throw to reject, return a promise to await.
// A `function (next)` signature here silently becomes `next is not a function`.
auditLogSchema.pre('save', function preventUpdate() {
  if (!this.isNew) throw new Error('AuditLog entries are immutable');
});

// ...and block every update/delete issued through the query API.
const MUTATING_OPS =
  /^(updateOne|updateMany|findOneAndUpdate|replaceOne|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete)$/;
auditLogSchema.pre(MUTATING_OPS, function blockMutations() {
  throw new Error('AuditLog is append-only');
});

/**
 * Best-effort write. Auditing must never break the request it records, so a failure is
 * logged and swallowed rather than thrown. Returns the doc, or null if the write failed.
 */
auditLogSchema.statics.record = async function record(entry) {
  try {
    return await this.create(entry);
  } catch (err) {
    logger.error({ err, action: entry?.action }, 'AuditLog.record failed');
    return null;
  }
};

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
