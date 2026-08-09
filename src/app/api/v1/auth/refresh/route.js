import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import AppError from '@/server/utils/AppError';
import {
  signAccessToken,
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
} from '@/server/utils/tokens';
import User from '@/server/modules/users/user.model';
import AuditLog, { ACTIONS } from '@/server/modules/audit/audit.model';
import { rotateRefreshToken } from '@/server/modules/auth/auth.service';
import { toErrorResponse } from '@/server/http/errors';

/*
 * POST /api/v1/auth/refresh — rotate the refresh cookie and mint a new access token.
 *
 * The server rotates on every use and revokes the whole family if an already-rotated token
 * is presented, so a replay looks exactly like a stolen token and ends every session. The
 * client side of that contract is single-flight — see src/api/client.ts.
 *
 * The failure paths must CLEAR the cookie, which is why they build their response here
 * rather than throwing: an error thrown out of the handler leaves through route()'s
 * formatter, which knows nothing about cookies, and a dead refresh token that stays in the
 * browser retries forever.
 */
export const POST = route({}, async ({ request, ctx, requestId }) => {
  const raw = readRefreshCookie(request);
  const { ip, userAgent } = ctx;
  if (!raw) throw AppError.unauthorized('Missing refresh token');

  let result;
  try {
    result = await rotateRefreshToken(raw, { ip, userAgent });
  } catch (err) {
    if (err.reuse) {
      // The family was already revoked inside rotateRefreshToken; record the breach.
      await AuditLog.record({
        actor: err.userId ?? null,
        action: ACTIONS.REFRESH_REUSE_DETECTED,
        status: 'failure',
        ip,
        userAgent,
      });
    }
    return clearRefreshCookie(toErrorResponse(err, { requestId, method: 'POST', path: '/api/v1/auth/refresh' }));
  }

  const user = await User.findById(result.userId);
  if (!user || user.status !== 'active') {
    return clearRefreshCookie(
      toErrorResponse(AppError.unauthorized('Account is not active'), {
        requestId,
        method: 'POST',
        path: '/api/v1/auth/refresh',
      })
    );
  }

  const accessToken = signAccessToken(user);
  await AuditLog.record({ actor: user._id, action: ACTIONS.TOKEN_REFRESHED, ip, userAgent });

  return setRefreshCookie(success({ accessToken }), result.rawToken);
});
