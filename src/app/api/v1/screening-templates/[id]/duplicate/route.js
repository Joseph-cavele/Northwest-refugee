import { route } from '@/server/http/route';
import { created } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/screening/screening.service';
import * as schema from '@/server/modules/screening/screening.schema';

/*
 * Copy a template as a fresh draft — the ordinary way a second skills programme gets its
 * form, since most of the questions are the same.
 *
 * The copy gets NEW keys throughout, which is the opposite of what editing does and correct
 * for the same reason: it is a different form, and sharing keys would let a report pool
 * answers from two questions that merely started from the same wording.
 */
export const POST = route(
  { permission: PERMISSIONS.SCREENING_TEMPLATE_MANAGE, params: schema.templateIdParamSchema },
  async ({ params, user, ctx }) => created(await service.duplicateTemplate(params.id, user, ctx))
);
