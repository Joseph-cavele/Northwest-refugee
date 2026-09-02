import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/screening/screening.service';
import * as schema from '@/server/modules/screening/screening.schema';

export const GET = route(
  { permission: PERMISSIONS.SCREENING_TEMPLATE_MANAGE, params: schema.templateIdParamSchema },
  async ({ params }) => success(await service.getTemplateById(params.id))
);

/*
 * Editing preserves every question key that is sent back, which is what keeps past answers
 * attached to the questions they answered. A client that drops the keys when it saves will
 * silently orphan them — see `withKeys` in the service.
 */
export const PATCH = route(
  {
    permission: PERMISSIONS.SCREENING_TEMPLATE_MANAGE,
    params: schema.templateIdParamSchema,
    body: schema.updateTemplateSchema,
  },
  async ({ params, body, user, ctx }) => success(await service.updateTemplate(params.id, body, user, ctx))
);
