import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/intake/intake.service';
import * as schema from '@/server/modules/intake/intake.schema';

/*
 * POST /api/v1/intakes/:id/link — this applicant is somebody already on the register.
 *
 * THE ANSWER TO THE DUPLICATE PROBLEM, and it is a human's answer rather than the system's.
 * The duplicate search offers candidates; this records which one an officer chose and that
 * they confirmed it. Linking does NOT approve anything — a returning beneficiary applying
 * for a new programme is still screened for it.
 */
export const POST = route(
  {
    permission: PERMISSIONS.INTAKE_UPDATE,
    params: schema.intakeIdParamSchema,
    body: schema.linkIntakeSchema,
  },
  async ({ params, body, user, ctx }) =>
    success(await service.linkToBeneficiary(params.id, body.beneficiary, user, ctx))
);
