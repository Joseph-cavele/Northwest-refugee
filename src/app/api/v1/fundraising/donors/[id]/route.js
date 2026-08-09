import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/fundraising/fundraising.service';
import * as schema from '@/server/modules/fundraising/fundraising.schema';

/** The tax number is withheld unless explicitly asked for — see getDonorById. */
export const GET = route(
  { permission: PERMISSIONS.DONOR_READ, params: schema.idParamSchema },
  async ({ params }) => success(await service.getDonorById(params.id))
);

export const PATCH = route(
  { permission: PERMISSIONS.DONOR_CREATE, params: schema.idParamSchema, body: schema.updateDonorSchema },
  async ({ params, body, user, ctx }) => success(await service.updateDonor(params.id, body, user, ctx))
);
