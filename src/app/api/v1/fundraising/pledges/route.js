import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/fundraising/fundraising.service';
import * as schema from '@/server/modules/fundraising/fundraising.schema';

export const POST = route(
  { permission: PERMISSIONS.PLEDGE_MANAGE, body: schema.createPledgeSchema },
  async ({ body, user, ctx }) => created(await service.createPledge(body, user, ctx))
);

/** Read with donation:read — a pledge is a promise of money, and reads with the money. */
export const GET = route(
  { permission: PERMISSIONS.DONATION_READ, query: schema.listPledgesSchema },
  async ({ query }) => paginated(await service.listPledges(query))
);
