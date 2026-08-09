import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/referrals/referral.service';
import * as schema from '@/server/modules/referrals/referral.schema';

/*
 * An outbound referral is a disclosure to a third party, which is why creating one is an
 * auditable event in its own right and why the service demands recorded sharing consent
 * before it will write one.
 */
export const POST = route(
  { permission: PERMISSIONS.REFERRAL_CREATE, body: schema.createReferralSchema },
  async ({ body, user, ctx }) => created(await service.createReferral(body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.REFERRAL_READ, query: schema.listReferralsSchema },
  async ({ query, user }) => paginated(await service.listReferrals(query, user))
);
