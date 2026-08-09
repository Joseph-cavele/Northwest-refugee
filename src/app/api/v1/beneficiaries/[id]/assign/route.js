import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/beneficiaries/beneficiary.service';
import * as schema from '@/server/modules/beneficiaries/beneficiary.schema';

export const POST = route(
  { permission: PERMISSIONS.BENEFICIARY_UPDATE, params: schema.beneficiaryIdParamSchema, body: schema.assignOfficerSchema },
  async ({ params, body, user, ctx }) =>
    success(await service.assignOfficer(params.id, body.assignedOfficer, user, ctx))
);
