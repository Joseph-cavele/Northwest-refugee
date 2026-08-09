import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/education/education.service';
import * as schema from '@/server/modules/education/education.schema';

export const DELETE = route(
  { permission: PERMISSIONS.EDUCATION_UPDATE, params: schema.memberParam },
  async ({ params, user, ctx }) =>
    success(await service.removeMember(params.id, params.beneficiaryId, user, ctx))
);
