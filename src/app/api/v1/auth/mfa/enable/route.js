import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import AppError from '@/server/utils/AppError';
import User from '@/server/modules/users/user.model';
import AuditLog, { ACTIONS } from '@/server/modules/audit/audit.model';
import { verifyTotp } from '@/server/modules/auth/auth.service';
import * as schema from '@/server/modules/auth/auth.schema';

/** POST /api/v1/auth/mfa/enable — confirm enrolment against the pending secret. */
export const POST = route({ auth: true, body: schema.mfaEnableSchema }, async ({ user: actor, body, ctx }) => {
  const user = await User.findById(actor._id).select('+mfaSecret');
  if (user.mfaEnabled) throw AppError.badRequest('MFA is already enabled');
  if (!user.mfaSecret) throw AppError.badRequest('Start MFA enrolment first');
  if (!verifyTotp(user.mfaSecret, body.code)) throw AppError.badRequest('Invalid authentication code');

  user.mfaEnabled = true;
  await user.save();
  await AuditLog.record({ actor: user._id, action: ACTIONS.MFA_ENROLLED, ip: ctx.ip, userAgent: ctx.userAgent });

  return success({ message: 'Two-factor authentication enabled' });
});
