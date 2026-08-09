import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/cases/case.service';
import * as schema from '@/server/modules/cases/case.schema';

export const POST = route(
  { permission: PERMISSIONS.CASE_UPDATE, params: schema.caseIdParamSchema, body: schema.assignCaseSchema },
  async ({ params, body, user, ctx }) =>
    success(await service.assignCase(params.id, body.caseworker, user, ctx))
);
