import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/referrals/referral.service';
import * as schema from '@/server/modules/referrals/referral.schema';

export const GET = route(
  { permission: PERMISSIONS.REFERRAL_READ, params: schema.referralIdParamSchema },
  async ({ params, user }) => success(await service.getReferralById(params.id, user))
);

export const PATCH = route(
  { permission: PERMISSIONS.REFERRAL_UPDATE, params: schema.referralIdParamSchema, body: schema.updateReferralSchema },
  async ({ params, body, user, ctx }) => success(await service.updateReferral(params.id, body, user, ctx))
);
