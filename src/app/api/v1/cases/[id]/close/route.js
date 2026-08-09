import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/cases/case.service';
import * as schema from '@/server/modules/cases/case.schema';

/*
 * Its own permission: a closed case drops out of every active-caseload figure, so closing
 * is not something everyone who can edit a case should be able to do.
 */
export const POST = route(
  { permission: PERMISSIONS.CASE_CLOSE, params: schema.caseIdParamSchema, body: schema.closeCaseSchema },
  async ({ params, body, user, ctx }) => success(await service.closeCase(params.id, body, user, ctx))
);
