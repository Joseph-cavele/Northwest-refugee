import { route } from '@/server/http/route';
import AppError from '@/server/utils/AppError';
import { sensitiveActionLimiter } from '@/server/http/rateLimit';
import { signAccessToken, setRefreshCookie } from '@/server/utils/tokens';
import { success } from '@/server/http/respond';
import User from '@/server/modules/users/user.model';
import AuditLog, { ACTIONS } from '@/server/modules/audit/audit.model';
import { revokeAllSessions, issueRefreshToken } from '@/server/modules/auth/auth.service';
import * as schema from '@/server/modules/auth/auth.schema';

/**
 * POST /api/v1/auth/change-password — for a signed-in user who knows their current password.
 *
 * Distinct from the reset flow, which proves identity by email instead. Both end the same
 * way: every previously issued credential stops working. `tokenVersion` invalidates the
 * stateless access tokens, revokeAllSessions() the refresh tokens.
 *
 * That includes the caller's own, so a fresh pair is issued before responding — otherwise
 * changing your password would sign you out of the tab you did it in.
 */
export const POST = route(
  { auth: true, body: schema.changePasswordSchema },
  async ({ user: actor, body, ctx }) => {
    // Keyed by the signed-in user, not IP+email: the body carries no email, and bucketing
    // the whole office behind one NAT address would let one person's typos lock out their
    // colleagues.
    sensitiveActionLimiter.check(`user:${actor._id}`);

    const { currentPassword, newPassword } = body;
    const { ip, userAgent } = ctx;

    const user = await User.findById(actor._id).select('+passwordHash');
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

    // Revoked BEFORE the new session is issued, or the fresh refresh token is caught by
    // the sweep it was meant to survive.
    await revokeAllSessions(user._id, 'password_reset');
    const accessToken = signAccessToken(user);
    const { rawToken } = await issueRefreshToken(user, ctx);

    await AuditLog.record({ actor: user._id, action: ACTIONS.PASSWORD_CHANGED, ip, userAgent });

    return setRefreshCookie(
      success({ message: 'Password changed. Other devices have been signed out.', accessToken }),
      rawToken
    );
  }
);
