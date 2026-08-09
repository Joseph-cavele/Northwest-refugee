import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/beneficiaries/beneficiary.service';
import * as schema from '@/server/modules/beneficiaries/beneficiary.schema';

/*
 * The permit number and the vulnerability flags.
 *
 * Its own permission AND its own audit entry. These fields are select:false precisely so
 * that loading them is a deliberate act that leaves a trace, not an incidental side effect
 * of a convenient query — so it must be an endpoint a caller chooses, never a field on the
 * main GET. The service writes the SENSITIVE_READ row; do not bypass it.
 */
export const GET = route(
  {
    permission: PERMISSIONS.BENEFICIARY_READ_SENSITIVE,
    params: schema.beneficiaryIdParamSchema,
    query: schema.sensitiveReadQuerySchema,
  },
  async ({ params, query, user, ctx }) =>
    success(await service.readSensitive(params.id, user, ctx, query?.reason))
);
