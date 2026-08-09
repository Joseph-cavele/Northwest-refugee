import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/fundraising/fundraising.service';
import * as schema from '@/server/modules/fundraising/fundraising.schema';

/** Reverses the campaign's raisedCents as well as marking the donation — both, or neither. */
export const POST = route(
  { permission: PERMISSIONS.DONATION_CREATE, params: schema.idParamSchema, body: schema.refundDonationSchema },
  async ({ params, body, user, ctx }) => success(await service.refundDonation(params.id, body, user, ctx))
);
