import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/finance/finance.service';
import * as schema from '@/server/modules/finance/finance.schema';

/*
 * MAKER-CHECKER. budget:create and budget:approve are never held by the same role, and the
 * creator can never approve their own — enforced in finance.service.js, not only in the
 * role table. Do not collapse these guards to "simplify" a flow.
 */
export const POST = route(
  { permission: PERMISSIONS.BUDGET_CREATE, body: schema.createBudgetSchema },
  async ({ body, user, ctx }) => created(await service.createBudget(body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.BUDGET_READ, query: schema.listBudgetsSchema },
  async ({ query }) => paginated(await service.listBudgets(query))
);
