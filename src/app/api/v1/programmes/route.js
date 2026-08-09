import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/programmes/programme.service';
import * as schema from '@/server/modules/programmes/programme.schema';

export const POST = route(
  { permission: PERMISSIONS.PROGRAMME_CREATE, body: schema.createProgrammeSchema },
  async ({ body, user, ctx }) => created(await service.createProgramme(body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.PROGRAMME_READ, query: schema.listProgrammesSchema },
  async ({ query, user }) => paginated(await service.listProgrammes(query, user))
);
