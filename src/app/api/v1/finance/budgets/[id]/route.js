import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/finance/finance.service';
import * as schema from '@/server/modules/finance/finance.schema';

export const GET = route(
  { permission: PERMISSIONS.BUDGET_READ, params: schema.idParamSchema },
  async ({ params }) => success(await service.getBudgetById(params.id))
);

export const PATCH = route(
  { permission: PERMISSIONS.BUDGET_CREATE, params: schema.idParamSchema, body: schema.updateBudgetSchema },
  async ({ params, body, user, ctx }) => success(await service.updateBudget(params.id, body, user, ctx))
);
