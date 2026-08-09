import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/serviceRequests/serviceRequest.service';
import * as schema from '@/server/modules/serviceRequests/serviceRequest.schema';

export const POST = route(
  {
    permission: PERMISSIONS.SERVICE_REQUEST_UPDATE,
    params: schema.serviceRequestIdParamSchema,
    body: schema.assignServiceRequestSchema,
  },
  async ({ params, body, user, ctx }) =>
    success(await service.assignServiceRequest(params.id, body.assignedTo, user, ctx))
);
