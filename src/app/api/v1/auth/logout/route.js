import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { clearRefreshCookie, readRefreshCookie } from '@/server/utils/tokens';
import AuditLog, { ACTIONS } from '@/server/modules/audit/audit.model';
import { revokeRefreshToken } from '@/server/modules/auth/auth.service';

/*
 * POST /api/v1/auth/logout — revoke the current refresh token.
 *
 * `optionalAuth`: works with or without a valid access token, which matters. Signing out of
 * an ALREADY-EXPIRED session must still clear the cookie rather than fail — otherwise the
 * one moment a user most wants to end a session is the moment the button stops working.
 */
export const POST = route({ optionalAuth: true }, async ({ request, user, ctx }) => {
  const raw = readRefreshCookie(request);
  if (raw) await revokeRefreshToken(raw, 'logout');
  if (user) {
    await AuditLog.record({ actor: user._id, action: ACTIONS.LOGOUT, ip: ctx.ip, userAgent: ctx.userAgent });
  }
  return clearRefreshCookie(success({ message: 'Logged out' }));
});
