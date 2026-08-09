import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/cases/case.service';
import * as schema from '@/server/modules/cases/case.schema';

export const GET = route(
  { permission: PERMISSIONS.CASE_READ, params: schema.caseIdParamSchema },
  async ({ params, user }) => success(await service.getCaseById(params.id, user))
);

export const PATCH = route(
  { permission: PERMISSIONS.CASE_UPDATE, params: schema.caseIdParamSchema, body: schema.updateCaseSchema },
  async ({ params, body, user, ctx }) => success(await service.updateCase(params.id, body, user, ctx))
);
