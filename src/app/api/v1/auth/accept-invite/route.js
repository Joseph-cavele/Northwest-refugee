import { route } from '@/server/http/route';
import AppError from '@/server/utils/AppError';
import User from '@/server/modules/users/user.model';
import AuditLog, { ACTIONS } from '@/server/modules/audit/audit.model';
import { Token } from '@/server/modules/auth/otp.model';
import { establishSession } from '@/server/modules/auth/session';
import * as schema from '@/server/modules/auth/auth.schema';

/**
 * POST /api/v1/auth/accept-invite — set the initial password, activate the account, sign in.
 *
 * Unlike the reset flow, this DOES sign you in: the invitation was the proof of identity,
 * and sending someone to a login screen seconds after they chose their password is a step
 * with nothing behind it.
 */
export const POST = route({ body: schema.acceptInviteSchema }, async ({ body, ctx }) => {
  const { token, password } = body;

  const tokenDoc = await Token.redeem({ token, type: 'invite' });
  if (!tokenDoc) throw AppError.badRequest('Invalid or expired invitation');

  const user = await User.findById(tokenDoc.user);
  if (!user || user.status === 'disabled') throw AppError.badRequest('Invalid or expired invitation');

  await user.setPassword(password);
  user.status = 'active';
  await user.save();
  await AuditLog.record({ actor: user._id, action: ACTIONS.USER_INVITE_ACCEPTED, ip: ctx.ip, userAgent: ctx.userAgent });

  const response = await establishSession(user, ctx);
  await AuditLog.record({ actor: user._id, action: ACTIONS.LOGIN_SUCCEEDED, ip: ctx.ip, userAgent: ctx.userAgent });
  return response;
});
