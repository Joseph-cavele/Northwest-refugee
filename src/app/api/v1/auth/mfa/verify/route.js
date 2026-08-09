import { route } from '@/server/http/route';
import AppError from '@/server/utils/AppError';
import { authLimiter, authKey } from '@/server/http/rateLimit';
import { verifyMfaChallenge } from '@/server/utils/tokens';
import User from '@/server/modules/users/user.model';
import AuditLog, { ACTIONS } from '@/server/modules/audit/audit.model';
import { verifyTotp } from '@/server/modules/auth/auth.service';
import { establishSession } from '@/server/modules/auth/session';
import * as schema from '@/server/modules/auth/auth.schema';

/** POST /api/v1/auth/mfa/verify — exchange a challenge token + TOTP code for real tokens. */
export const POST = route({ body: schema.mfaVerifySchema }, async ({ body, ctx }) => {
  // No email in this body to bucket on, so the challenge token stands in — it identifies
  // one pending sign-in, which is exactly the thing being guessed at.
  authLimiter.check(authKey(ctx.ip, body.challengeToken));

  const { challengeToken, code } = body;
  const { ip, userAgent } = ctx;

  const userId = verifyMfaChallenge(challengeToken);
  const user = await User.findById(userId).select('+mfaSecret');
  if (!user || user.status !== 'active' || !user.mfaEnabled) {
    throw AppError.unauthorized('Invalid MFA challenge');
  }

  if (!verifyTotp(user.mfaSecret, code)) {
    await AuditLog.record({ actor: user._id, action: ACTIONS.MFA_CHALLENGE_FAILED, status: 'failure', ip, userAgent });
    throw AppError.unauthorized('Invalid authentication code');
  }

  const response = await establishSession(user, ctx);
  await AuditLog.record({ actor: user._id, action: ACTIONS.MFA_CHALLENGE_PASSED, ip, userAgent });
  await AuditLog.record({ actor: user._id, action: ACTIONS.LOGIN_SUCCEEDED, ip, userAgent });
  return response;
});
