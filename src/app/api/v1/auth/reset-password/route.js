import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import AppError from '@/server/utils/AppError';
import { passwordResetLimiter } from '@/server/http/rateLimit';
import User from '@/server/modules/users/user.model';
import AuditLog, { ACTIONS } from '@/server/modules/audit/audit.model';
import { Token } from '@/server/modules/auth/otp.model';
import { revokeAllSessions } from '@/server/modules/auth/auth.service';
import * as schema from '@/server/modules/auth/auth.schema';

/**
 * POST /api/v1/auth/reset-password — set a new password and end every existing session.
 *
 * Does NOT sign you in, on purpose. It bumps tokenVersion (killing every outstanding access
 * token) and revokes every refresh token, so a stolen session cannot survive the reset —
 * which is the entire point of resetting. The only correct ending is "now sign in".
 */
export const POST = route({ body: schema.resetPasswordSchema }, async ({ body, ctx }) => {
  // Keyed by IP alone: the body carries a token, not an email, and bucketing on a
  // single-use secret would give every attempt its own fresh allowance.
  passwordResetLimiter.check(ctx.ip);

  const { token, password } = body;

  const tokenDoc = await Token.redeem({ token, type: 'reset' });
  if (!tokenDoc) throw AppError.badRequest('Invalid or expired reset link');

  const user = await User.findById(tokenDoc.user);
  if (!user) throw AppError.badRequest('Invalid or expired reset link');

  await user.setPassword(password);
  user.tokenVersion += 1; // invalidates every previously issued access token
  await user.save();
  await revokeAllSessions(user._id, 'password_reset'); // invalidates every refresh token
  await AuditLog.record({
    actor: user._id,
    action: ACTIONS.PASSWORD_RESET_COMPLETED,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return success({ message: 'Password updated. Please sign in.' });
});
