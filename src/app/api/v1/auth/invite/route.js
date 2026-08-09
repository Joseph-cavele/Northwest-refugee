import { route } from '@/server/http/route';
import { created } from '@/server/http/respond';
import AppError from '@/server/utils/AppError';
import { PERMISSIONS } from '@/server/config/permissions';
import User from '@/server/modules/users/user.model';
import AuditLog, { ACTIONS } from '@/server/modules/audit/audit.model';
import { Token } from '@/server/modules/auth/otp.model';
import { INVITE_TTL_MS } from '@/server/modules/auth/auth.service';
import { assertMayGrantRole } from '@/server/modules/auth/accessRequest.service';
import * as departments from '@/server/modules/departments/department.service';
import { sendInviteEmail } from '@/server/modules/notifications/email.service';
import { trySend } from '@/server/modules/auth/session';
import * as schema from '@/server/modules/auth/auth.schema';

/** POST /api/v1/auth/invite — create an invited staff account and email the activation link. */
export const POST = route(
  { permission: PERMISSIONS.USER_INVITE, body: schema.inviteSchema },
  async ({ user: actor, body, ctx }) => {
    const { name, email, role, departmentId = null } = body;

    // `user:invite` says they may onboard someone; this says which role they may hand out.
    // Shared with the access-request approval path so the two cannot diverge.
    assertMayGrantRole(actor, role);

    if (departmentId) await departments.assertAssignableDepartment(departmentId);

    if (await User.findOne({ email })) {
      throw AppError.conflict('A user with that email already exists');
    }

    const user = await User.create({ name, email, role, departmentId, status: 'invited', invitedBy: actor._id });
    const raw = await Token.issue({ user: user._id, type: 'invite', ttlMs: INVITE_TTL_MS });
    // The account and its token are already committed, so a failed send must not discard
    // them — it is reported instead, and the inviter can resend.
    const emailSent = await trySend(() => sendInviteEmail(user, raw), { userId: user._id, kind: 'invite' });

    await AuditLog.record({
      actor: actor._id,
      action: ACTIONS.USER_INVITED,
      targetType: 'User',
      targetId: user._id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      meta: { role, email, emailSent },
    });

    // emailSent tells the inviter whether to resend or share the link another way.
    return created({ user, emailSent });
  }
);
