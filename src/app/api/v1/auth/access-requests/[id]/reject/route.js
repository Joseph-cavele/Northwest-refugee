import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/auth/accessRequest.service';
import * as schema from '@/server/modules/auth/auth.schema';

/** POST /api/v1/auth/access-requests/:id/reject — terminal; an admin who changes their mind invites directly. */
export const POST = route(
  {
    permission: PERMISSIONS.ACCESS_REQUEST_REVIEW,
    params: schema.accessRequestIdParamSchema,
    body: schema.rejectAccessRequestSchema,
  },
  async ({ params, body, user, ctx }) =>
    success(await service.rejectAccessRequest(params.id, body, user, ctx))
);
