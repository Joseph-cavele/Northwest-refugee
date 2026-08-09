import { route } from '@/server/http/route';
import { paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/cases/case.service';
import * as schema from '@/server/modules/cases/case.schema';

/*
 * GET /api/v1/cases/urgent — HIGH or URGENT and still open, oldest first.
 *
 * A thin alias over the same scoped list rather than a separate query, so the supervisor's
 * queue can never show a case the caller would not be allowed to open.
 */
export const GET = route(
  { permission: PERMISSIONS.CASE_READ, query: schema.listCasesSchema },
  async ({ query, user }) => paginated(await service.listCases({ ...query, urgent: true }, user))
);
