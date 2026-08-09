import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/education/education.service';
import * as schema from '@/server/modules/education/education.schema';

export const GET = route(
  { permission: PERMISSIONS.EDUCATION_READ, params: schema.idParam },
  async ({ params, user }) => success(await service.getPlacementById(params.id, user))
);

export const PATCH = route(
  { permission: PERMISSIONS.EDUCATION_UPDATE, params: schema.idParam, body: schema.updatePlacementSchema },
  async ({ params, body, user, ctx }) => success(await service.updatePlacement(params.id, body, user, ctx))
);
