import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/enrollments/enrollment.service';
import * as schema from '@/server/modules/enrollments/enrollment.schema';

/** One person's attendance rate across their cohort. */
export const GET = route(
  { permission: PERMISSIONS.ENROLLMENT_READ, params: schema.enrollmentIdParamSchema },
  async ({ params, user }) => success(await service.getAttendanceSummary(params.id, user))
);
