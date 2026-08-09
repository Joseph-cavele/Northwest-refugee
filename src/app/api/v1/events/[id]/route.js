import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/events/event.service';
import * as schema from '@/server/modules/events/event.schema';

export const GET = route(
  { permission: PERMISSIONS.EVENT_READ, params: schema.eventIdParamSchema },
  async ({ params, user }) => success(await service.getEventById(params.id, user))
);

export const PATCH = route(
  { permission: PERMISSIONS.EVENT_UPDATE, params: schema.eventIdParamSchema, body: schema.updateEventSchema },
  async ({ params, body, user, ctx }) => success(await service.updateEvent(params.id, body, user, ctx))
);
