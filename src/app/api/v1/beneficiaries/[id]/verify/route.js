import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/beneficiaries/beneficiary.service';
import * as schema from '@/server/modules/beneficiaries/beneficiary.schema';

export const POST = route(
  { permission: PERMISSIONS.BENEFICIARY_VERIFY, params: schema.beneficiaryIdParamSchema, body: schema.verifyBeneficiarySchema },
  async ({ params, body, user, ctx }) => success(await service.verifyBeneficiary(params.id, body, user, ctx))
);
