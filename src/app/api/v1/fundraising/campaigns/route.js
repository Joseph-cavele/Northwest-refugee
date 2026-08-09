import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/fundraising/fundraising.service';
import * as schema from '@/server/modules/fundraising/fundraising.schema';

export const POST = route(
  { permission: PERMISSIONS.CAMPAIGN_CREATE, body: schema.createCampaignSchema },
  async ({ body, user, ctx }) => created(await service.createCampaign(body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.CAMPAIGN_READ, query: schema.listCampaignsSchema },
  async ({ query }) => paginated(await service.listCampaigns(query))
);
