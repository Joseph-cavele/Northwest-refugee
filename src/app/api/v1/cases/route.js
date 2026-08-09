import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/cases/case.service';
import * as schema from '@/server/modules/cases/case.schema';

export const POST = route(
  { permission: PERMISSIONS.CASE_CREATE, body: schema.openCaseSchema },
  async ({ body, user, ctx }) => created(await service.openCase(body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.CASE_READ, query: schema.listCasesSchema },
  async ({ query, user }) => paginated(await service.listCases(query, user))
);
