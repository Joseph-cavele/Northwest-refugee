import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/enrollments/enrollment.service';
import * as schema from '@/server/modules/enrollments/enrollment.schema';

export const POST = route(
  { permission: PERMISSIONS.ENROLLMENT_CREATE, body: schema.enrollSchema },
  async ({ body, user, ctx }) => created(await service.enroll(body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.ENROLLMENT_READ, query: schema.listEnrollmentsSchema },
  async ({ query, user }) => paginated(await service.listEnrollments(query, user))
);
