import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/beneficiaries/beneficiary.service';
import * as schema from '@/server/modules/beneficiaries/beneficiary.schema';

export const GET = route(
  { permission: PERMISSIONS.BENEFICIARY_READ, params: schema.beneficiaryIdParamSchema },
  async ({ params, user }) => success(await service.getBeneficiaryById(params.id, user))
);

export const PATCH = route(
  {
    permission: PERMISSIONS.BENEFICIARY_UPDATE,
    params: schema.beneficiaryIdParamSchema,
    body: schema.updateBeneficiarySchema,
  },
  async ({ params, body, user, ctx }) => success(await service.updateBeneficiary(params.id, body, user, ctx))
);

/*
 * Soft delete only — the record is retained and the case history preserved. Held by the
 * Admin Officer alone: a coordinator or peer leader removing someone from the register
 * would silently end their access to services.
 */
export const DELETE = route(
  { permission: PERMISSIONS.BENEFICIARY_DELETE, params: schema.beneficiaryIdParamSchema },
  async ({ params, user, ctx }) => success(await service.softDeleteBeneficiary(params.id, user, ctx))
);
