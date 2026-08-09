import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/serviceRequests/serviceRequest.service';
import * as schema from '@/server/modules/serviceRequests/serviceRequest.schema';

/*
 * Status changes have their own endpoint rather than being a field on PATCH, so an invalid
 * jump — resolving an already-resolved request — is refused with a 409 that says which
 * transitions are available, instead of being written silently.
 */
export const POST = route(
  {
    permission: PERMISSIONS.SERVICE_REQUEST_UPDATE,
    params: schema.serviceRequestIdParamSchema,
    body: schema.transitionServiceRequestSchema,
  },
  async ({ params, body, user, ctx }) =>
    success(await service.transitionServiceRequest(params.id, body, user, ctx))
);
