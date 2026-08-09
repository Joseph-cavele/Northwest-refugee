import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/ai/aiUsage.service';
import * as schema from '@/server/modules/ai/aiUsage.schema';

/*
 * GET /api/v1/ai/spend — what the classifier has cost this period.
 *
 * Read-only by design. There is no route that adjusts the ceiling: the budget is an
 * operating decision that belongs in configuration, reviewed with the rest of it, not a
 * number anyone can raise from a dashboard at the moment it becomes inconvenient.
 *
 * Guarded by budget:read — this is a spend figure, so the people who may see budgets are
 * exactly the people who may see it.
 */
export const GET = route(
  { permission: PERMISSIONS.BUDGET_READ, query: schema.spendQuerySchema },
  async ({ query }) => success(await service.getSpend(query?.period ?? service.currentPeriod()))
);
