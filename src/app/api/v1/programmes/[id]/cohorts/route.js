import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/programmes/programme.service';
import * as schema from '@/server/modules/programmes/programme.schema';

export const POST = route(
  { permission: PERMISSIONS.PROGRAMME_UPDATE, params: schema.programmeIdParamSchema, body: schema.createCohortSchema },
  async ({ params, body, user, ctx }) => created(await service.createCohort(params.id, body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.PROGRAMME_READ, params: schema.programmeIdParamSchema, query: schema.listCohortsSchema },
  async ({ params, query, user }) => paginated(await service.listCohorts(params.id, query, user))
);
