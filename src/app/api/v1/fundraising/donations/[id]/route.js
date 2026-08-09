import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/fundraising/fundraising.service';
import * as schema from '@/server/modules/fundraising/fundraising.schema';

export const GET = route(
  { permission: PERMISSIONS.DONATION_READ, params: schema.idParamSchema },
  async ({ params }) => success(await service.getDonationById(params.id))
);
