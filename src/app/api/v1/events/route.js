import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/events/event.service';
import * as schema from '@/server/modules/events/event.schema';

export const POST = route(
  { permission: PERMISSIONS.EVENT_CREATE, body: schema.createEventSchema },
  async ({ body, user, ctx }) => created(await service.createEvent(body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.EVENT_READ, query: schema.listEventsSchema },
  async ({ query, user }) => paginated(await service.listEvents(query, user))
);
