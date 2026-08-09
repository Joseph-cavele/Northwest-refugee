import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import AppError from '@/server/utils/AppError';
import { dashboardForRole } from '@/server/config/constants';
import { normalisePhone } from '@/server/utils/phone';
import User from '@/server/modules/users/user.model';
import AuditLog, { ACTIONS } from '@/server/modules/audit/audit.model';
import * as schema from '@/server/modules/auth/auth.schema';

/** GET /api/v1/auth/me — the authenticated user. */
export const GET = route({ auth: true }, async ({ user }) => {
  // Populated on this path only: /me is the profile screen, where the department's name is
  // what a person expects to see rather than its id.
  const populated = await user.populate({ path: 'departmentId', select: 'name slug' });
  return success({ user: populated, dashboard: dashboardForRole(populated.role) });
});

/**
 * PATCH /api/v1/auth/me — self-service profile edit.
 *
 * Only `name` and `phone`. Email is the login identifier, and role/department/status are
 * the authorisation surface — none of them are a person's to change about themselves.
 */
export const PATCH = route(
  { auth: true, body: schema.updateProfileSchema },
  async ({ user: actor, body, ctx }) => {
    const user = await User.findById(actor._id);
    if (!user) throw AppError.notFound('User');

    if (body.name !== undefined) user.name = body.name;

    if (body.phone !== undefined) {
      if (body.phone === null) {
        user.phone = null;
      } else {
        const normalised = normalisePhone(body.phone);
        if (!normalised) throw AppError.validationFailed({ phone: 'Enter a valid phone number' });
        user.phone = normalised;
      }
    }

    await user.save();
    // Field names only. A phone number is personal information, and the audit trail is read
    // by more people, and kept longer, than the record it describes.
    await AuditLog.record({
      actor: user._id,
      action: ACTIONS.PROFILE_UPDATED,
      targetType: 'User',
      targetId: user._id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      meta: { fields: Object.keys(body) },
    });

    return success({ user });
  }
);
