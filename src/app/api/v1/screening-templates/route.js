import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/screening/screening.service';
import * as schema from '@/server/modules/screening/screening.schema';

/*
 * The screening forms themselves, built by an administrator.
 *
 * This is what stops programme-specific screening forms being written into pages: a new
 * skills programme needs a template and a link to it, not a developer. The engine that
 * renders them does not know what any question means.
 */

export const GET = route(
  { permission: PERMISSIONS.SCREENING_TEMPLATE_MANAGE, query: schema.listTemplatesSchema },
  async ({ query }) => paginated(await service.listTemplates(query))
);

export const POST = route(
  { permission: PERMISSIONS.SCREENING_TEMPLATE_MANAGE, body: schema.createTemplateSchema },
  async ({ body, user, ctx }) => created(await service.createTemplate(body, user, ctx))
);
