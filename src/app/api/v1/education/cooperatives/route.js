import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/education/education.service';
import * as schema from '@/server/modules/education/education.schema';

export const POST = route(
  { permission: PERMISSIONS.EDUCATION_CREATE, body: schema.createCooperativeSchema },
  async ({ body, user, ctx }) => created(await service.createCooperative(body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.EDUCATION_READ, query: schema.listCooperativesSchema },
  async ({ query, user }) => paginated(await service.listCooperatives(query, user))
);
