import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/fundraising/fundraising.service';
import * as schema from '@/server/modules/fundraising/fundraising.schema';

/*
 * The denormalised `raisedCents` counter reconciled against the donations themselves.
 * `reconciled: false` means the counter has drifted from the ledger and someone must look.
 */
export const GET = route(
  { permission: PERMISSIONS.CAMPAIGN_READ, params: schema.idParamSchema },
  async ({ params }) => success(await service.getCampaignTotals(params.id))
);
