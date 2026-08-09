import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/fundraising/fundraising.service';
import * as schema from '@/server/modules/fundraising/fundraising.schema';

/*
 * A donor chasing their tax certificate is answered from `receiptEmailedAt`, not from an
 * assumption that settling implied sending. This resends without reissuing the number.
 */
export const POST = route(
  { permission: PERMISSIONS.DONATION_CREATE, params: schema.idParamSchema },
  async ({ params, user, ctx }) => success(await service.resendReceipt(params.id, user, ctx))
);
