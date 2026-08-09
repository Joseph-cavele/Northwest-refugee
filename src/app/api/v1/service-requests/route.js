import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/serviceRequests/serviceRequest.service';
import * as schema from '@/server/modules/serviceRequests/serviceRequest.schema';

export const POST = route(
  { permission: PERMISSIONS.SERVICE_REQUEST_CREATE, body: schema.createServiceRequestSchema },
  async ({ body, user, ctx }) => created(await service.createServiceRequest(body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.SERVICE_REQUEST_READ, query: schema.listServiceRequestsSchema },
  async ({ query, user }) => paginated(await service.listServiceRequests(query, user))
);
