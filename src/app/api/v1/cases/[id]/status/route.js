import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/cases/case.service';
import * as schema from '@/server/modules/cases/case.schema';

/** OPEN ↔ ON_HOLD only. Closing is a different permission and a different endpoint. */
export const POST = route(
  { permission: PERMISSIONS.CASE_UPDATE, params: schema.caseIdParamSchema, body: schema.reopenHoldSchema },
  async ({ params, body, user, ctx }) => success(await service.setCaseStatus(params.id, body, user, ctx))
);
