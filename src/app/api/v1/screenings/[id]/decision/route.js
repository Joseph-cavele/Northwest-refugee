import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/screening/screening.service';
import * as schema from '@/server/modules/screening/screening.schema';

/*
 * POST /api/v1/screenings/:id/decision — the moment somebody becomes a beneficiary, or does
 * not.
 *
 * BEHIND `screening:decide`, WHICH IS NOT `screening:conduct`. Asking the questions and
 * writing down the answers is desk work; deciding is the act that creates a register record
 * for a person or refuses them one. A peer leader holds the first permission and not the
 * second, and the split is enforced here rather than in the screen that renders the buttons.
 *
 * This is the ONLY route in the system that can turn an applicant into a beneficiary. That
 * is the point: creating a register record is authorised by a screening decision, so any
 * other path to it would be a way of registering somebody without one.
 */
export const POST = route(
  {
    permission: PERMISSIONS.SCREENING_DECIDE,
    params: schema.screeningIdParamSchema,
    body: schema.decisionSchema,
  },
  async ({ params, body, user, ctx }) => success(await service.decide(params.id, body, user, ctx))
);
