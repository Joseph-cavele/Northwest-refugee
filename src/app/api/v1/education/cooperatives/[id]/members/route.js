import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/education/education.service';
import * as schema from '@/server/modules/education/education.schema';

/** A cooperative needs a minimum membership to register — see MIN_COOPERATIVE_MEMBERS. */
export const POST = route(
  { permission: PERMISSIONS.EDUCATION_UPDATE, params: schema.idParam, body: schema.memberSchema },
  async ({ params, body, user, ctx }) => success(await service.addMember(params.id, body, user, ctx))
);
