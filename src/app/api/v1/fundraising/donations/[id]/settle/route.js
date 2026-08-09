import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/fundraising/fundraising.service';
import * as schema from '@/server/modules/fundraising/fundraising.schema';

/*
 * IDEMPOTENT. Gateways retry, and a replay must not double-count the money — the unique
 * sparse index on `providerReference` is what guarantees that, not the code that calls it.
 * Settling is also what issues the s18A receipt number.
 */
export const POST = route(
  { permission: PERMISSIONS.DONATION_CREATE, params: schema.idParamSchema, body: schema.settleDonationSchema },
  async ({ params, body, user, ctx }) => success(await service.settleDonation(params.id, body, user, ctx))
);
