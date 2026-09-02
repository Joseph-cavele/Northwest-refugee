import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/intake/intake.service';
import * as schema from '@/server/modules/intake/intake.schema';

export const GET = route(
  { permission: PERMISSIONS.INTAKE_READ, params: schema.intakeIdParamSchema },
  async ({ params }) => success(await service.getIntakeById(params.id))
);

/*
 * Editing an intake is refused once it is linked to a beneficiary — the service says why.
 * In short: after linking, the register is the source of truth for that person's details,
 * and two editable copies of a phone number is a question nobody can answer.
 */
export const PATCH = route(
  {
    permission: PERMISSIONS.INTAKE_UPDATE,
    params: schema.intakeIdParamSchema,
    body: schema.updateIntakeSchema,
  },
  async ({ params, body, user, ctx }) => success(await service.updateIntake(params.id, body, user, ctx))
);
