import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/fundraising/fundraising.service';
import * as schema from '@/server/modules/fundraising/fundraising.schema';

export const PATCH = route(
  { permission: PERMISSIONS.PLEDGE_MANAGE, params: schema.idParamSchema, body: schema.updatePledgeSchema },
  async ({ params, body, user, ctx }) => success(await service.updatePledge(params.id, body, user, ctx))
);
