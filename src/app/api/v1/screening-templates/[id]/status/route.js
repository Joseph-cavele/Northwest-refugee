import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/screening/screening.service';
import * as schema from '@/server/modules/screening/screening.schema';

/*
 * Publish, archive, or send a template back to draft.
 *
 * Its own endpoint rather than a field on PATCH, for the same reason publishing an event is:
 * publishing makes a form usable for real decisions about real people, which is a different
 * act from correcting a typo in it. Publishing an empty template is refused — it would
 * render a form with nothing on it that could then be attached to a programme.
 */
export const POST = route(
  {
    permission: PERMISSIONS.SCREENING_TEMPLATE_MANAGE,
    params: schema.templateIdParamSchema,
    body: schema.templateStatusSchema,
  },
  async ({ params, body, user, ctx }) =>
    success(await service.setTemplateStatus(params.id, body.status, user, ctx))
);
