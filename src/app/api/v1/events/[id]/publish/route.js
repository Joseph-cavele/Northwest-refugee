import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/events/event.service';
import * as schema from '@/server/modules/events/event.schema';

/*
 * POST /api/v1/events/:id/publish — put an event on the public site, or take it off.
 *
 * ITS OWN ROUTE AND ITS OWN PERMISSION, rather than a field on PATCH. Editing an event and
 * publishing one are different acts with different audiences: an edit changes an internal
 * record, publishing puts a time and a place in front of people who may travel across
 * Rustenburg on the strength of it. Behind `event:publish`, which the Executive Director and
 * the Comms Officer hold and the coordinators who plan events do not.
 *
 * The body states the end state (`publish: true|false`) rather than toggling, so a double
 * click or a retried request cannot land the event in the opposite state from the one the
 * officer chose.
 */
export const POST = route(
  {
    permission: PERMISSIONS.EVENT_PUBLISH,
    params: schema.eventIdParamSchema,
    body: schema.publishEventSchema,
  },
  async ({ params, body, user, ctx }) =>
    success(await service.setPublication(params.id, body.publish, user, ctx))
);
