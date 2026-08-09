import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { normalisePhone } from '../../utils/phone.js';
import { loggerFor } from '../../config/logger.js';
import { withTransaction } from '../../config/db.js';
import { ROLES, ROLE_LABELS } from '../../config/constants.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
import * as notifications from '../notifications/notification.service.js';
import * as departments from '../departments/department.service.js';
import {
  sendInviteEmail,
  sendAccessRequestReceivedEmail,
  sendAccessRequestRejectedEmail,
} from '../notifications/email.service.js';
import User from '../users/user.model.js';
import { Token } from './otp.model.js';
import { INVITE_TTL_MS } from './auth.service.js';
import AccessRequest from './accessRequest.model.js';

const log = loggerFor('accessRequest.service');

// Staff onboarding, step one. The submit path is the only unauthenticated write in the
// system, so it is written to give an anonymous caller nothing back: the same sentence
// whether the email is unknown, already a staff account, or already has a request open.

/**
 * The single answer the public endpoint ever returns.
 *
 * Varying this by outcome would turn the form into an account oracle — submit an address,
 * read the response, learn whether that person works here. Every branch below returns it.
 */
const SUBMISSION_ACK = {
  message:
    'Thank you. Your access request has been received and will be reviewed by an administrator.',
};

/**
 * Send an email without letting a provider outage change the outcome of the request.
 * Mirrors trySend() in auth.controller.js — the account and the token are already
 * committed by the time this runs, so a failure is reported, never thrown.
 */
async function trySend(send, meta) {
  try {
    await send();
    return true;
  } catch (err) {
    log.error({ err, ...meta }, 'access request email failed to send');
    return false;
  }
}

/**
 * Privilege-escalation guard: only an Executive Director may create another one.
 *
 * `user:invite` is held by the Admin Officer, whose whole job is onboarding — but the ED
 * role carries every approval ceiling in APPROVAL_CEILINGS, so being able to mint one is
 * being able to approve any amount through an account you control. The role table says who
 * may invite; this says which role they may hand out.
 */
export function assertMayGrantRole(actor, role) {
  if (role === ROLES.EXECUTIVE_DIRECTOR && actor.role !== ROLES.EXECUTIVE_DIRECTOR) {
    throw AppError.forbidden('Only an Executive Director can grant the Executive Director role');
  }
}

// --- submit (public) --------------------------------------------------------------

/**
 * Record an access request from someone with no account.
 *
 * Returns SUBMISSION_ACK on every path, including the ones where nothing was written.
 */
export async function submitAccessRequest(data, ctx = {}) {
  const phone = normalisePhone(data.phone);
  if (!phone) throw AppError.validationFailed({ phone: 'Enter a valid phone number' });

  // Validated before the enumeration-safe branches below, because a bad department id is a
  // broken form rather than a fact about who works here.
  await departments.assertAssignableDepartment(data.departmentId);

  const email = data.email.toLowerCase();

  // Already staff, or already in the queue. Nothing to write, and the caller is told
  // exactly what everyone else is told.
  const [existingUser, openRequest] = await Promise.all([
    User.exists({ email }),
    AccessRequest.exists({ email, status: 'PENDING' }),
  ]);
  if (existingUser || openRequest) {
    await audit.record({
      actor: null,
      action: ACTIONS.ACCESS_REQUEST_SUBMITTED,
      status: 'failure',
      ctx,
      meta: { email, reason: existingUser ? 'account_exists' : 'duplicate_pending' },
    });
    return SUBMISSION_ACK;
  }

  let request;
  try {
    request = await AccessRequest.create({ ...data, email, phone });
  } catch (err) {
    // Two submissions racing past the exists() check above; the partial unique index is
    // the real guard. Same answer, so the race is invisible to the caller.
    if (err?.code === 11000) return SUBMISSION_ACK;
    throw err;
  }

  await audit.record({
    actor: null,
    action: ACTIONS.ACCESS_REQUEST_SUBMITTED,
    targetType: 'AccessRequest',
    targetId: request._id,
    ctx,
    meta: { email, requestedRole: request.requestedRole },
  });

  // Addressed by permission, not by role name, so re-tuning who may review re-routes the
  // alert with it. Best-effort by design — see notification.service.js.
  await notifications.notifyPermission(PERMISSIONS.ACCESS_REQUEST_REVIEW, {
    title: 'New Staff Access Request',
    message:
      `${request.fullName} has requested access as ` +
      `${ROLE_LABELS[request.requestedRole] ?? request.requestedRole}. ` +
      'Review the request to approve or reject it.',
    type: 'ACCESS_REQUEST',
    referenceId: request._id,
    // Someone is waiting on a person to act; this should not sit behind routine traffic.
    priority: 'HIGH',
  });

  await trySend(() => sendAccessRequestReceivedEmail(request), {
    requestId: String(request._id),
    kind: 'access_request_received',
  });

  return SUBMISSION_ACK;
}

/**
 * What the public form needs to render: the active departments and the roles that may be
 * requested. Deliberately narrow — names and labels only, no staff and no counts.
 *
 * EXECUTIVE_DIRECTOR is not offered. Nobody applies for it through a public form, and
 * listing it only invites the attempt.
 */
export async function getAccessRequestOptions() {
  const departmentList = await departments.listActiveDepartmentOptions();
  return {
    departments: departmentList.map((d) => ({ id: String(d._id), name: d.name, slug: d.slug })),
    roles: Object.values(ROLES)
      .filter((role) => role !== ROLES.EXECUTIVE_DIRECTOR)
      .map((role) => ({ value: role, label: ROLE_LABELS[role] })),
  };
}

// --- review (authenticated) -------------------------------------------------------

export function listAccessRequests(query = {}) {
  const { page, limit, sort, status, search } = query;

  const filter = {};
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  return paginateQuery(AccessRequest, filter, {
    page,
    limit,
    // Oldest pending first by default: a queue nobody waits at the back of.
    sort: sort ?? 'createdAt',
    populate: [
      { path: 'departmentId', select: 'name slug' },
      { path: 'reviewedBy', select: 'name role' },
    ],
  });
}

export async function getAccessRequestById(id) {
  const doc = await AccessRequest.findById(id)
    .populate('departmentId', 'name slug')
    .populate('reviewedBy', 'name role')
    .populate('createdUser', 'name email role status');
  if (!doc) throw AppError.notFound('Access request');
  return doc;
}

async function findPendingOrFail(id) {
  const request = await AccessRequest.findById(id);
  if (!request) throw AppError.notFound('Access request');
  if (!request.isPending()) {
    // 409, not 404: the record is right there, it has simply already been decided. A
    // second approver clicking a stale queue must be told that, not shown a missing page.
    throw AppError.conflict(`This request has already been ${request.status.toLowerCase()}`);
  }
  return request;
}

/**
 * Approve: create the staff account, mint its activation token, and close the request.
 *
 * The account, the token and the status change commit together — an account with no way to
 * claim it, or a request marked approved with no account behind it, are both silent
 * failures nobody notices until the applicant says the link never arrived.
 *
 * @param {object}  overrides
 * @param {string} [overrides.role]          the role actually granted; defaults to the requested one
 * @param {string} [overrides.departmentId]  reassign on approval
 */
export async function approveAccessRequest(id, overrides = {}, actor, ctx = {}) {
  const request = await findPendingOrFail(id);

  const grantedRole = overrides.role ?? request.requestedRole;
  assertMayGrantRole(actor, grantedRole);

  const departmentId = overrides.departmentId ?? request.departmentId;
  await departments.assertAssignableDepartment(departmentId);

  // Checked before the transaction for a clean 409, and again by the unique index on
  // User.email inside it — someone may be invited by another route while this runs.
  if (await User.exists({ email: request.email })) {
    throw AppError.conflict('A user with that email already exists');
  }

  let result;
  try {
    result = await withTransaction(async (session) => {
      const options = session ? { session } : {};

      const [user] = await User.create(
        [
          {
            // The applicant gave their name in two parts; the User model stores one.
            name: request.fullName,
            email: request.email,
            phone: request.phone,
            role: grantedRole,
            departmentId,
            status: 'invited',
            invitedBy: actor._id,
          },
        ],
        options
      );

      const rawToken = await Token.issue({
        user: user._id,
        type: 'invite',
        ttlMs: INVITE_TTL_MS,
        session,
      });

      request.status = 'APPROVED';
      request.grantedRole = grantedRole;
      request.departmentId = departmentId;
      request.reviewedBy = actor._id;
      request.reviewedAt = new Date();
      request.decisionNote = overrides.note ?? '';
      request.createdUser = user._id;
      await request.save(options);

      return { user, rawToken };
    });
  } catch (err) {
    if (err?.code === 11000) throw AppError.conflict('A user with that email already exists');
    throw err;
  }

  // Outside the transaction: a mail provider outage must not roll back a committed
  // account. `emailSent` tells the approver whether to resend or share the link another way.
  const emailSent = await trySend(() => sendInviteEmail(result.user, result.rawToken), {
    userId: String(result.user._id),
    kind: 'invite',
  });

  await audit.record({
    actor,
    action: ACTIONS.ACCESS_REQUEST_APPROVED,
    targetType: 'AccessRequest',
    targetId: request._id,
    ctx,
    meta: {
      email: request.email,
      requestedRole: request.requestedRole,
      grantedRole,
      userId: String(result.user._id),
      emailSent,
    },
  });
  // A second entry against the account itself, so "how did this user come to exist" is
  // answerable from the User's own trail without knowing the request existed.
  await audit.record({
    actor,
    action: ACTIONS.USER_INVITED,
    targetType: 'User',
    targetId: result.user._id,
    ctx,
    meta: { role: grantedRole, email: request.email, via: 'access_request', emailSent },
  });

  return { request, user: result.user, emailSent };
}

/** Reject, with a reason the applicant is told. Terminal — they may reapply. */
export async function rejectAccessRequest(id, { reason }, actor, ctx = {}) {
  const request = await findPendingOrFail(id);

  request.status = 'REJECTED';
  request.reviewedBy = actor._id;
  request.reviewedAt = new Date();
  request.decisionNote = reason ?? '';
  await request.save();

  const emailSent = await trySend(() => sendAccessRequestRejectedEmail(request), {
    requestId: String(request._id),
    kind: 'access_request_rejected',
  });

  await audit.record({
    actor,
    action: ACTIONS.ACCESS_REQUEST_REJECTED,
    targetType: 'AccessRequest',
    targetId: request._id,
    ctx,
    meta: { email: request.email, requestedRole: request.requestedRole, emailSent },
  });

  return { request, emailSent };
}
