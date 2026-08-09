import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/enrollments/enrollment.service';
import * as schema from '@/server/modules/enrollments/enrollment.schema';

export const GET = route(
  { permission: PERMISSIONS.ENROLLMENT_READ, params: schema.enrollmentIdParamSchema },
  async ({ params, user }) => success(await service.getEnrollmentById(params.id, user))
);

export const PATCH = route(
  {
    permission: PERMISSIONS.ENROLLMENT_UPDATE,
    params: schema.enrollmentIdParamSchema,
    body: schema.updateEnrollmentSchema,
  },
  async ({ params, body, user, ctx }) => success(await service.updateEnrollment(params.id, body, user, ctx))
);
