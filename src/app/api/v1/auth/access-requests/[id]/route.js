import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/auth/accessRequest.service';
import * as schema from '@/server/modules/auth/auth.schema';

/** GET /api/v1/auth/access-requests/:id */
export const GET = route(
  { permission: PERMISSIONS.ACCESS_REQUEST_READ, params: schema.accessRequestIdParamSchema },
  async ({ params }) => success(await service.getAccessRequestById(params.id))
);
