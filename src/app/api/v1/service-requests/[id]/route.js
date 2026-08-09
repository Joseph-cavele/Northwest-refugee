import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/serviceRequests/serviceRequest.service';
import * as schema from '@/server/modules/serviceRequests/serviceRequest.schema';

export const GET = route(
  { permission: PERMISSIONS.SERVICE_REQUEST_READ, params: schema.serviceRequestIdParamSchema },
  async ({ params, user }) => success(await service.getServiceRequestById(params.id, user))
);

export const PATCH = route(
  {
    permission: PERMISSIONS.SERVICE_REQUEST_UPDATE,
    params: schema.serviceRequestIdParamSchema,
    body: schema.updateServiceRequestSchema,
  },
  async ({ params, body, user, ctx }) =>
    success(await service.updateServiceRequest(params.id, body, user, ctx))
);
