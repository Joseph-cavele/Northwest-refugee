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

/*
 * A SOFT delete, behind its own permission — see the note in the service. The event keeps
 * its attendance register, which is the evidence the organisation shows a funder; what
 * changes is that it leaves every listing, staff-side and public.
 *
 * Returns the record rather than 204, so the screen that called it can show what it did
 * without a second request.
 */
export const DELETE = route(
  { permission: PERMISSIONS.EVENT_DELETE, params: schema.eventIdParamSchema },
  async ({ params, user, ctx }) => success(await service.deleteEvent(params.id, user, ctx))
);
