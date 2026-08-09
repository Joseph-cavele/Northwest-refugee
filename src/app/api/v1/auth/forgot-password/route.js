import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { passwordResetLimiter, authKey } from '@/server/http/rateLimit';
import User from '@/server/modules/users/user.model';
import AuditLog, { ACTIONS } from '@/server/modules/audit/audit.model';
import { Token } from '@/server/modules/auth/otp.model';
import { INVITE_TTL_MS, RESET_TTL_MS } from '@/server/modules/auth/auth.service';
import { trySend } from '@/server/modules/auth/session';
import { sendInviteEmail, sendPasswordResetEmail } from '@/server/modules/notifications/email.service';
import * as schema from '@/server/modules/auth/auth.schema';

/**
 * POST /api/v1/auth/forgot-password — responds identically whether or not the account exists.
 *
 * Sends whichever link the account can actually use:
 *
 *   active  → a password reset link (1 hour)
 *   invited → a FRESH INVITE link (7 days)
 *
 * The second branch exists because an invited user who never set a password had no way out
 * at all. They cannot sign in (`status !== 'active'` fails the login check), a reset link
 * would be useless because accept-invite is what activates the account, and re-applying
 * for access is answered with silence since the account already exists.
 *
 * `disabled` deliberately matches neither. A deactivated account must not be able to
 * resurrect itself by asking for a link.
 *
 * Both branches issue one token and attempt one email, so they are indistinguishable to a
 * caller by timing as well as by response. Do not "improve" this by reporting what was sent.
 */
export const POST = route({ body: schema.forgotPasswordSchema }, async ({ body, ctx }) => {
  passwordResetLimiter.check(authKey(ctx.ip, body.email));

  const { email } = body;
  const { ip, userAgent } = ctx;
  const user = await User.findOne({ email });

  if (user?.status === 'active') {
    const raw = await Token.issue({ user: user._id, type: 'reset', ttlMs: RESET_TTL_MS });
    // Swallowed deliberately: the response below must be byte-identical whether or not the
    // account exists, and a provider error is the one thing that could betray it.
    await trySend(() => sendPasswordResetEmail(user, raw), { userId: user._id, kind: 'reset' });
    await AuditLog.record({ actor: user._id, action: ACTIONS.PASSWORD_RESET_REQUESTED, ip, userAgent, meta: { email } });
  } else if (user?.status === 'invited') {
    // Supersede first: reissuing must replace the lost link, not add a second live one.
    const superseded = await Token.supersede({ user: user._id, type: 'invite' });
    const raw = await Token.issue({ user: user._id, type: 'invite', ttlMs: INVITE_TTL_MS });
    await trySend(() => sendInviteEmail(user, raw), { userId: user._id, kind: 'invite' });
    // Recorded as an invitation rather than a reset, because that is what was sent — and
    // `via` keeps a self-service reissue distinguishable from an admin's invite.
    await AuditLog.record({
      actor: user._id,
      action: ACTIONS.USER_INVITED,
      targetType: 'User',
      targetId: user._id,
      ip,
      userAgent,
      meta: { email, via: 'forgot_password_reissue', superseded },
    });
  }

  return success({ message: 'If that account exists, a reset link has been sent.' });
});
