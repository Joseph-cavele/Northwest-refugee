import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/screening/screening.service';
import * as schema from '@/server/modules/screening/screening.schema';

export const GET = route(
  { permission: PERMISSIONS.SCREENING_CONDUCT, query: schema.listScreeningsSchema },
  async ({ query }) => paginated(await service.listScreenings(query))
);

/*
 * Start screening an intake. The template is resolved from the programme rather than chosen
 * by the caller — see `startScreening` — and a copy of it is frozen onto the screening so
 * the questions this person was asked can never change afterwards.
 *
 * Returns the existing screening when one is already open for this intake, rather than
 * creating a second: two open screenings means two officers asking the same person the same
 * questions and reaching decisions that can disagree.
 */
export const POST = route(
  { permission: PERMISSIONS.SCREENING_CONDUCT, body: schema.startScreeningSchema },
  async ({ body, user, ctx }) => created(await service.startScreening(body, user, ctx))
);
