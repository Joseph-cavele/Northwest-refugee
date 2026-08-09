import { route } from '@/server/http/route';
import { success, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/enrollments/enrollment.service';
import * as schema from '@/server/modules/enrollments/enrollment.schema';

/*
 * The register for one session.
 *
 * Re-marking corrects the existing row rather than adding a second — a register corrected
 * twice would otherwise inflate the denominator of every attendance rate a funder is shown.
 *
 * Capturing is its own permission (attendance:capture) and is held by peer leaders and
 * volunteers, who may mark a register without being able to edit the enrolment behind it.
 */
export const POST = route(
  {
    permission: PERMISSIONS.ATTENDANCE_CAPTURE,
    params: schema.sessionIdParamSchema,
    body: schema.markAttendanceSchema,
  },
  async ({ params, body, user, ctx }) =>
    success(await service.markAttendance(params.sessionId, body.marks, user, ctx))
);

export const GET = route(
  {
    permission: PERMISSIONS.ENROLLMENT_READ,
    params: schema.sessionIdParamSchema,
    query: schema.listAttendanceSchema,
  },
  async ({ params, query, user }) =>
    paginated(await service.listSessionAttendance(params.sessionId, query, user))
);
