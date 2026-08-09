import { route } from '@/server/http/route';
import { created } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/auth/accessRequest.service';
import * as schema from '@/server/modules/auth/auth.schema';

/*
 * POST /api/v1/auth/access-requests/:id/approve
 *
 * Held with ACCESS_REQUEST_REVIEW rather than READ: approving is what mints a staff
 * account. Reading a queue of applicants and deciding on one are different powers, which is
 * why config/permissions.js separates them.
 *
 * 201, because approving creates the account.
 */
export const POST = route(
  {
    permission: PERMISSIONS.ACCESS_REQUEST_REVIEW,
    params: schema.accessRequestIdParamSchema,
    body: schema.approveAccessRequestSchema,
  },
  async ({ params, body, user, ctx }) =>
    created(await service.approveAccessRequest(params.id, body, user, ctx))
);
