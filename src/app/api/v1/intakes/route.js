import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/intake/intake.service';
import * as schema from '@/server/modules/intake/intake.schema';

/*
 * /api/v1/intakes — applications, before anybody has decided anything about them.
 *
 * PLURAL, AND NOT THE SAME ROUTE AS /api/v1/intake. That one is the public form: no auth, a
 * strict subset schema, and a rate limiter, because the applicant is the caller. Everything
 * here is staff-side and permission-gated. The two are deliberately separate paths rather
 * than one route branching on whether a token was presented — a guard that depends on
 * reading the request is a guard somebody can forget to read.
 */

export const GET = route(
  { permission: PERMISSIONS.INTAKE_READ, query: schema.listIntakesSchema },
  async ({ query }) => paginated(await service.listIntakes(query))
);

/** A walk-in, captured at the desk. Creates an Intake and never a Beneficiary. */
export const POST = route(
  { permission: PERMISSIONS.INTAKE_CREATE, body: schema.walkInIntakeSchema },
  async ({ body, user, ctx }) => created(await service.createWalkInIntake(body, user, ctx))
);
