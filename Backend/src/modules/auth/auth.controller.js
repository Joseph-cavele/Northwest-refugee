import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendCreated } from '../../utils/apiResponse.js';
import AppError from '../../utils/AppError.js';
import { loggerFor } from '../../config/logger.js';
import { dashboardForRole } from '../../config/constants.js';
import { normalisePhone } from '../../utils/phone.js';
import User from '../users/user.model.js';
import AuditLog, { ACTIONS } from '../audit/audit.model.js';
import { assertMayGrantRole } from './accessRequest.service.js';
import * as departments from '../departments/department.service.js';
import { Token } from './otp.model.js';
import {
  signAccessToken,
  issueMfaChallenge,
  verifyMfaChallenge,
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
} from '../../utils/tokens.js';
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllSessions,
  generateMfaSecret,
  buildOtpAuthUri,
  verifyTotp,
  INVITE_TTL_MS,
  RESET_TTL_MS,
} from './auth.service.js';
import { sendInviteEmail, sendPasswordResetEmail } from '../notifications/email.service.js';

const log = loggerFor('auth.controller');

/**
 * Send an action email without letting a provider outage change the outcome of the
 * request.
 *
 * A throw here used to propagate: an invite would create the account and the token, then
 * 500 — leaving an account nobody knew existed and an inviter who believed it failed. On
 * the reset path it was worse than untidy: only a KNOWN address reaches the provider, so a
 * 500 there versus a 200 for an unknown address is an account-enumeration oracle.
 */
async function trySend(send, meta) {
  try {
    await send();
    return true;
  } catch (err) {
    log.error({ err, ...meta }, 'action email failed to send');
    return false;
  }
}

// Request context attached to sessions and audit rows.
function ctx(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] ?? '' };
}

// Sign an access token, issue and set a rotating refresh cookie. Shared by every path
// that completes authentication (login without MFA, MFA verify, invite acceptance).
async function establishSession(req, res, user) {
  const accessToken = signAccessToken(user);
  const { rawToken } = await issueRefreshToken(user, ctx(req));
  setRefreshCookie(res, rawToken);
  return accessToken;
}

/**
 * The body every completed sign-in returns.
 *
 * `dashboard` is where the SPA should land this person — a convenience so the client does
 * not keep its own copy of the role-to-route table and drift out of step with the server.
 * It is NOT an authorisation decision: each dashboard's data is still fetched through
 * permission-guarded routes, so editing this value client-side buys a different empty
 * screen and a string of 403s.
 */
function authPayload(user, accessToken) {
  return { user, accessToken, dashboard: dashboardForRole(user.role) };
}

// POST /login — password stage. Returns tokens, or an MFA challenge if 2FA is enabled.
export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const { ip, userAgent } = ctx(req);
  const user = await User.findOne({ email }).select('+passwordHash');

  // Unknown and inactive accounts fail identically to a wrong password — no enumeration.
  if (!user || user.status !== 'active') {
    await AuditLog.record({ action: ACTIONS.LOGIN_FAILED, status: 'failure', ip, userAgent, meta: { email } });
    throw AppError.unauthorized('Invalid email or password');
  }

  if (user.isLocked()) {
    await AuditLog.record({ actor: user._id, action: ACTIONS.ACCOUNT_LOCKED, status: 'failure', ip, userAgent, meta: { email } });
    throw AppError.forbidden('Account temporarily locked due to failed logins. Try again later.');
  }

  if (!(await user.comparePassword(password))) {
    user.registerFailedLogin();
    await user.save();
    await AuditLog.record({ actor: user._id, action: ACTIONS.LOGIN_FAILED, status: 'failure', ip, userAgent, meta: { email } });
    if (user.isLocked()) {
      await AuditLog.record({ actor: user._id, action: ACTIONS.ACCOUNT_LOCKED, status: 'failure', ip, userAgent, meta: { email } });
    }
    throw AppError.unauthorized('Invalid email or password');
  }

  // Correct password — clear the lockout counter.
  user.resetLoginState();
  await user.save();

  if (user.mfaEnabled) {
    // Hold off on real tokens until the TOTP code is verified.
    return sendSuccess(res, { mfaRequired: true, challengeToken: issueMfaChallenge(user) });
  }

  const accessToken = await establishSession(req, res, user);
  await AuditLog.record({ actor: user._id, action: ACTIONS.LOGIN_SUCCEEDED, ip, userAgent });
  sendSuccess(res, authPayload(user, accessToken));
});

// POST /mfa/verify — second stage: exchange a challenge token + TOTP code for real tokens.
export const mfaVerify = catchAsync(async (req, res) => {
  const { challengeToken, code } = req.body;
  const { ip, userAgent } = ctx(req);

  const userId = verifyMfaChallenge(challengeToken);
  const user = await User.findById(userId).select('+mfaSecret');
  if (!user || user.status !== 'active' || !user.mfaEnabled) {
    throw AppError.unauthorized('Invalid MFA challenge');
  }

  if (!verifyTotp(user.mfaSecret, code)) {
    await AuditLog.record({ actor: user._id, action: ACTIONS.MFA_CHALLENGE_FAILED, status: 'failure', ip, userAgent });
    throw AppError.unauthorized('Invalid authentication code');
  }

  const accessToken = await establishSession(req, res, user);
  await AuditLog.record({ actor: user._id, action: ACTIONS.MFA_CHALLENGE_PASSED, ip, userAgent });
  await AuditLog.record({ actor: user._id, action: ACTIONS.LOGIN_SUCCEEDED, ip, userAgent });
  sendSuccess(res, authPayload(user, accessToken));
});

// POST /refresh — rotate the refresh cookie and mint a new access token.
export const refresh = catchAsync(async (req, res) => {
  const raw = readRefreshCookie(req);
  const { ip, userAgent } = ctx(req);
  if (!raw) throw AppError.unauthorized('Missing refresh token');

  let result;
  try {
    result = await rotateRefreshToken(raw, { ip, userAgent });
  } catch (err) {
    clearRefreshCookie(res);
    if (err.reuse) {
      // The family was already revoked inside rotateRefreshToken; record the breach.
      await AuditLog.record({ actor: err.userId ?? null, action: ACTIONS.REFRESH_REUSE_DETECTED, status: 'failure', ip, userAgent });
    }
    throw err;
  }

  const user = await User.findById(result.userId);
  if (!user || user.status !== 'active') {
    clearRefreshCookie(res);
    throw AppError.unauthorized('Account is not active');
  }

  setRefreshCookie(res, result.rawToken);
  const accessToken = signAccessToken(user);
  await AuditLog.record({ actor: user._id, action: ACTIONS.TOKEN_REFRESHED, ip, userAgent });
  sendSuccess(res, { accessToken });
});

// POST /logout — revoke the current refresh token. Works with or without an access token.
export const logout = catchAsync(async (req, res) => {
  const raw = readRefreshCookie(req);
  const { ip, userAgent } = ctx(req);
  if (raw) await revokeRefreshToken(raw, 'logout');
  clearRefreshCookie(res);
  if (req.user) await AuditLog.record({ actor: req.user._id, action: ACTIONS.LOGOUT, ip, userAgent });
  sendSuccess(res, { message: 'Logged out' });
});

// POST /logout-all — revoke every session and invalidate outstanding access tokens.
export const logoutAll = catchAsync(async (req, res) => {
  const { ip, userAgent } = ctx(req);
  await revokeAllSessions(req.user._id, 'logout');
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  clearRefreshCookie(res);
  await AuditLog.record({ actor: req.user._id, action: ACTIONS.SESSION_REVOKED, ip, userAgent, meta: { scope: 'all' } });
  sendSuccess(res, { message: 'Signed out of all sessions' });
});

// POST /accept-invite — set the initial password, activate the account, and sign in.
export const acceptInvite = catchAsync(async (req, res) => {
  const { token, password } = req.body;
  const { ip, userAgent } = ctx(req);

  const tokenDoc = await Token.redeem({ token, type: 'invite' });
  if (!tokenDoc) throw AppError.badRequest('Invalid or expired invitation');

  const user = await User.findById(tokenDoc.user);
  if (!user || user.status === 'disabled') throw AppError.badRequest('Invalid or expired invitation');

  await user.setPassword(password);
  user.status = 'active';
  await user.save();
  await AuditLog.record({ actor: user._id, action: ACTIONS.USER_INVITE_ACCEPTED, ip, userAgent });

  const accessToken = await establishSession(req, res, user);
  await AuditLog.record({ actor: user._id, action: ACTIONS.LOGIN_SUCCEEDED, ip, userAgent });
  sendSuccess(res, authPayload(user, accessToken));
});

/**
 * POST /forgot-password — responds identically whether or not the account exists.
 *
 * Sends whichever link the account can actually use:
 *
 *   active  → a password reset link (1 hour)
 *   invited → a FRESH INVITE link (7 days)
 *
 * The second branch exists because an invited user who never set a password had no way
 * out at all. They cannot sign in (`status !== 'active'` fails the login check), a reset
 * link would be useless because `accept-invite` is what activates the account, and
 * re-applying for access is answered with silence since the account already exists. With
 * a 7-day invite TTL, anyone onboarded while they are on leave hits this — and only an
 * administrator noticing could unstick them.
 *
 * `disabled` deliberately matches neither. A deactivated account must not be able to
 * resurrect itself by asking for a link.
 *
 * Both branches issue one token and attempt one email, so they are indistinguishable to
 * a caller by timing as well as by response.
 */
export const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;
  const { ip, userAgent } = ctx(req);

  const user = await User.findOne({ email });

  if (user?.status === 'active') {
    const raw = await Token.issue({ user: user._id, type: 'reset', ttlMs: RESET_TTL_MS });
    // Swallowed deliberately: the response below must be byte-identical whether or not
    // the account exists, and a provider error is the one thing that could betray it.
    await trySend(() => sendPasswordResetEmail(user, raw), { userId: user._id, kind: 'reset' });
    await AuditLog.record({ actor: user._id, action: ACTIONS.PASSWORD_RESET_REQUESTED, ip, userAgent, meta: { email } });
  } else if (user?.status === 'invited') {
    // Supersede first: reissuing must replace the lost link, not add a second live one.
    const superseded = await Token.supersede({ user: user._id, type: 'invite' });
    const raw = await Token.issue({ user: user._id, type: 'invite', ttlMs: INVITE_TTL_MS });
    await trySend(() => sendInviteEmail(user, raw), { userId: user._id, kind: 'invite' });
    // Recorded as an invitation rather than a reset, because that is what was sent —
    // and `via` keeps a self-service reissue distinguishable from an admin's invite.
    await AuditLog.record({
      actor: user._id,
      action: ACTIONS.USER_INVITED,
      targetType: 'User',
      targetId: user._id,
      ip,
      userAgent,
      meta: { email, via: 'forgot_password_reissue', superseded },
    });
  }

  sendSuccess(res, { message: 'If that account exists, a reset link has been sent.' });
});

// POST /reset-password — set a new password and revoke BOTH access (via tokenVersion) and
// refresh tokens, so a stolen session cannot survive the reset.
export const resetPassword = catchAsync(async (req, res) => {
  const { token, password } = req.body;
  const { ip, userAgent } = ctx(req);

  const tokenDoc = await Token.redeem({ token, type: 'reset' });
  if (!tokenDoc) throw AppError.badRequest('Invalid or expired reset link');

  const user = await User.findById(tokenDoc.user);
  if (!user) throw AppError.badRequest('Invalid or expired reset link');

  await user.setPassword(password);
  user.tokenVersion += 1; // invalidates every previously issued access token
  await user.save();
  await revokeAllSessions(user._id, 'password_reset'); // invalidates every refresh token
  await AuditLog.record({ actor: user._id, action: ACTIONS.PASSWORD_RESET_COMPLETED, ip, userAgent });

  sendSuccess(res, { message: 'Password updated. Please sign in.' });
});

// GET /me — the authenticated user (authenticate has already loaded it).
export const me = catchAsync(async (req, res) => {
  // Populated on this path only: /me is the profile screen, where the department's name is
  // what a person expects to see rather than its id.
  const user = await req.user.populate({ path: 'departmentId', select: 'name slug' });
  sendSuccess(res, { user, dashboard: dashboardForRole(user.role) });
});

/**
 * PATCH /me — self-service profile edit.
 *
 * Only `name` and `phone`. The schema is where the exclusions are justified: email is the
 * login identifier, and role/department/status are the authorisation surface.
 */
export const updateProfile = catchAsync(async (req, res) => {
  const { ip, userAgent } = ctx(req);
  const user = await User.findById(req.user._id);
  if (!user) throw AppError.notFound('User');

  if (req.body.name !== undefined) user.name = req.body.name;

  if (req.body.phone !== undefined) {
    if (req.body.phone === null) {
      user.phone = null;
    } else {
      const normalised = normalisePhone(req.body.phone);
      if (!normalised) throw AppError.validationFailed({ phone: 'Enter a valid phone number' });
      user.phone = normalised;
    }
  }

  await user.save();
  // Field names only. A phone number is personal information, and the audit trail is read
  // by more people, and kept longer, than the record it describes.
  await AuditLog.record({
    actor: user._id,
    action: ACTIONS.PROFILE_UPDATED,
    targetType: 'User',
    targetId: user._id,
    ip,
    userAgent,
    meta: { fields: Object.keys(req.body) },
  });

  sendSuccess(res, { user });
});

/**
 * POST /change-password — for a signed-in user who knows their current password.
 *
 * Distinct from the reset flow, which proves identity by email instead. Both end the same
 * way: every previously issued credential stops working. `tokenVersion` invalidates the
 * stateless access tokens, revokeAllSessions() the refresh tokens.
 *
 * That includes the caller's own, so a fresh pair is issued before responding — otherwise
 * changing your password would sign you out of the tab you did it in.
 */
export const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const { ip, userAgent } = ctx(req);

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) throw AppError.notFound('User');

  if (!(await user.comparePassword(currentPassword))) {
    await AuditLog.record({
      actor: user._id,
      action: ACTIONS.PASSWORD_CHANGED,
      status: 'failure',
      ip,
      userAgent,
      meta: { reason: 'wrong_current_password' },
    });
    // 401, not 422: this is a failed credential check, not a malformed field.
    throw AppError.unauthorized('Your current password is incorrect');
  }

  await user.setPassword(newPassword);
  user.tokenVersion += 1;
  await user.save();

  // Revoked BEFORE the new session is issued, or the fresh refresh token is caught by the
  // sweep it was meant to survive.
  await revokeAllSessions(user._id, 'password_reset');
  const accessToken = await establishSession(req, res, user);

  await AuditLog.record({ actor: user._id, action: ACTIONS.PASSWORD_CHANGED, ip, userAgent });

  sendSuccess(res, {
    message: 'Password changed. Other devices have been signed out.',
    accessToken,
  });
});

// POST /invite — create an invited staff account and email the activation link.
// Guarded by authorize('user:invite') on the route.
export const invite = catchAsync(async (req, res) => {
  const { name, email, role, departmentId = null } = req.body;
  const { ip, userAgent } = ctx(req);

  // `user:invite` says they may onboard someone; this says which role they may hand out.
  // Shared with the access-request approval path so the two cannot diverge.
  assertMayGrantRole(req.user, role);

  if (departmentId) await departments.assertAssignableDepartment(departmentId);

  if (await User.findOne({ email })) {
    throw AppError.conflict('A user with that email already exists');
  }

  const user = await User.create({
    name,
    email,
    role,
    departmentId,
    status: 'invited',
    invitedBy: req.user._id,
  });
  const raw = await Token.issue({ user: user._id, type: 'invite', ttlMs: INVITE_TTL_MS });
  // The account and its token are already committed, so a failed send must not discard
  // them — it is reported instead, and the inviter can resend.
  const emailSent = await trySend(() => sendInviteEmail(user, raw), { userId: user._id, kind: 'invite' });
  await AuditLog.record({
    actor: req.user._id,
    action: ACTIONS.USER_INVITED,
    targetType: 'User',
    targetId: user._id,
    ip,
    userAgent,
    meta: { role, email, emailSent },
  });

  // emailSent tells the inviter whether to resend or share the link another way.
  sendCreated(res, { user, emailSent });
});

// POST /mfa/enroll — generate a secret and return the otpauth URI for QR display.
// Not active until confirmed via /mfa/enable.
export const mfaEnroll = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select('+mfaSecret');
  if (user.mfaEnabled) throw AppError.badRequest('MFA is already enabled');

  const secret = generateMfaSecret();
  user.mfaSecret = secret;
  await user.save();

  sendSuccess(res, { secret, otpauthUri: buildOtpAuthUri(user, secret) });
});

// POST /mfa/enable — confirm enrolment by verifying a code against the pending secret.
export const mfaEnable = catchAsync(async (req, res) => {
  const { code } = req.body;
  const { ip, userAgent } = ctx(req);

  const user = await User.findById(req.user._id).select('+mfaSecret');
  if (user.mfaEnabled) throw AppError.badRequest('MFA is already enabled');
  if (!user.mfaSecret) throw AppError.badRequest('Start MFA enrolment first');
  if (!verifyTotp(user.mfaSecret, code)) throw AppError.badRequest('Invalid authentication code');

  user.mfaEnabled = true;
  await user.save();
  await AuditLog.record({ actor: user._id, action: ACTIONS.MFA_ENROLLED, ip, userAgent });

  sendSuccess(res, { message: 'Two-factor authentication enabled' });
});
