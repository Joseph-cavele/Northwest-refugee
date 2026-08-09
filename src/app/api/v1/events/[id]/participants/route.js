import { route } from '@/server/http/route';
import { success, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/events/event.service';
import * as schema from '@/server/modules/events/event.schema';

/*
 * The participant register.
 *
 * A community event is attended by people who are not on the beneficiary register and who
 * did not consent to being put on it — which is why a participant carries a gender and an
 * age band but only an optional link to a Beneficiary, and why contact details are stored
 * only where `consentToContact` was given.
 */
export const POST = route(
  {
    permission: PERMISSIONS.EVENT_UPDATE,
    params: schema.eventIdParamSchema,
    body: schema.recordParticipantsSchema,
  },
  async ({ params, body, user, ctx }) =>
    success(await service.recordParticipants(params.id, body.participants, user, ctx))
);

export const GET = route(
  {
    permission: PERMISSIONS.EVENT_READ,
    params: schema.eventIdParamSchema,
    query: schema.listParticipantsSchema,
  },
  async ({ params, query, user }) => paginated(await service.listParticipants(params.id, query, user))
);
