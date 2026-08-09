import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/departments/department.service';
import * as schema from '@/server/modules/departments/department.schema';

export const GET = route(
  { permission: PERMISSIONS.DEPARTMENT_READ, params: schema.departmentIdParamSchema },
  async ({ params }) => success(await service.getDepartmentById(params.id))
);

export const PATCH = route(
  {
    permission: PERMISSIONS.DEPARTMENT_UPDATE,
    params: schema.departmentIdParamSchema,
    body: schema.updateDepartmentSchema,
  },
  async ({ params, body, user, ctx }) =>
    success(await service.updateDepartment(params.id, body, user, ctx))
);
