import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/departments/department.service';
import * as schema from '@/server/modules/departments/department.schema';

/*
 * Authenticated throughout. The one place departments are needed without a login is the
 * public staff access-request form, which is served a narrower list by
 * GET /api/v1/auth/access-requests/options.
 */

export const POST = route(
  { permission: PERMISSIONS.DEPARTMENT_CREATE, body: schema.createDepartmentSchema },
  async ({ body, user, ctx }) => created(await service.createDepartment(body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.DEPARTMENT_READ, query: schema.listDepartmentsSchema },
  async ({ query }) => paginated(await service.listDepartments(query))
);
