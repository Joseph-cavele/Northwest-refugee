import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/referrals/referral.service';
import * as schema from '@/server/modules/referrals/referral.schema';

/*
 * Separate from PATCH so an invalid jump — completing an already-declined referral — is
 * refused with a 409 naming the available transitions, instead of being written silently.
 */
export const POST = route(
  { permission: PERMISSIONS.REFERRAL_UPDATE, params: schema.referralIdParamSchema, body: schema.transitionReferralSchema },
  async ({ params, body, user, ctx }) => success(await service.transitionReferral(params.id, body, user, ctx))
);
