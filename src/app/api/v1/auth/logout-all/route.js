import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { clearRefreshCookie } from '@/server/utils/tokens';
import User from '@/server/modules/users/user.model';
import AuditLog, { ACTIONS } from '@/server/modules/audit/audit.model';
import { revokeAllSessions } from '@/server/modules/auth/auth.service';

/*
 * POST /api/v1/auth/logout-all — revoke every session on every device.
 *
 * Two mechanisms, because there are two kinds of credential: revokeAllSessions() kills the
 * stored refresh tokens, and bumping tokenVersion invalidates the stateless access tokens
 * that are already out there and cannot be recalled.
 */
export const POST = route({ auth: true }, async ({ user, ctx }) => {
  await revokeAllSessions(user._id, 'logout');
  await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
  await AuditLog.record({
    actor: user._id,
    action: ACTIONS.SESSION_REVOKED,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    meta: { scope: 'all' },
  });
  return clearRefreshCookie(success({ message: 'Signed out of all sessions' }));
});
