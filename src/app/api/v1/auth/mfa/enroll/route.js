import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import AppError from '@/server/utils/AppError';
import User from '@/server/modules/users/user.model';
import { generateMfaSecret, buildOtpAuthUri } from '@/server/modules/auth/auth.service';

/**
 * POST /api/v1/auth/mfa/enroll — generate a secret and return the otpauth URI for a QR.
 *
 * Not active until confirmed via /mfa/enable. Storing the secret before it is proven means
 * a half-finished enrolment cannot lock anyone out — `mfaEnabled` is what the login path
 * reads, and it stays false until a real code has been verified.
 */
export const POST = route({ auth: true }, async ({ user: actor }) => {
  const user = await User.findById(actor._id).select('+mfaSecret');
  if (user.mfaEnabled) throw AppError.badRequest('MFA is already enabled');

  const secret = generateMfaSecret();
  user.mfaSecret = secret;
  await user.save();

  return success({ secret, otpauthUri: buildOtpAuthUri(user, secret) });
});
