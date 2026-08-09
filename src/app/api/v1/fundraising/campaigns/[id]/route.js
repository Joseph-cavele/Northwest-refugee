import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/fundraising/fundraising.service';
import * as schema from '@/server/modules/fundraising/fundraising.schema';

export const GET = route(
  { permission: PERMISSIONS.CAMPAIGN_READ, params: schema.idParamSchema },
  async ({ params }) => success(await service.getCampaignById(params.id))
);

/** `raisedCents` is derived from settled donations and is never writable here. */
export const PATCH = route(
  { permission: PERMISSIONS.CAMPAIGN_UPDATE, params: schema.idParamSchema, body: schema.updateCampaignSchema },
  async ({ params, body, user, ctx }) => success(await service.updateCampaign(params.id, body, user, ctx))
);
