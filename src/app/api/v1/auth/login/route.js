import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import AppError from '@/server/utils/AppError';
import { authLimiter, authKey } from '@/server/http/rateLimit';
import { issueMfaChallenge } from '@/server/utils/tokens';
import User from '@/server/modules/users/user.model';
import AuditLog, { ACTIONS } from '@/server/modules/audit/audit.model';
import { establishSession } from '@/server/modules/auth/session';
import * as schema from '@/server/modules/auth/auth.schema';

/*
 * POST /api/v1/auth/login — password stage. Returns tokens, or an MFA challenge.
 *
 * Unknown accounts, wrong passwords and inactive accounts fail IDENTICALLY. That is not
 * an oversight to be smoothed over into friendlier copy: distinguishing them turns this
 * endpoint into an oracle for who works here.
 */
export const POST = route({ body: schema.loginSchema }, async ({ body, ctx }) => {
  // Keyed by IP *and* email so neither a shared office IP nor one account can be
  // brute-forced. Checked before any database work, as the middleware was.
  authLimiter.check(authKey(ctx.ip, body.email));

  const { email, password } = body;
  const { ip, userAgent } = ctx;
  const user = await User.findOne({ email }).select('+passwordHash');

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
    // Hold off on real tokens until the TOTP code is verified. No refresh cookie is set
    // here, which is the point: a challenge is not a session.
    return success({ mfaRequired: true, challengeToken: issueMfaChallenge(user) });
  }

  const response = await establishSession(user, ctx);
  await AuditLog.record({ actor: user._id, action: ACTIONS.LOGIN_SUCCEEDED, ip, userAgent });
  return response;
});
