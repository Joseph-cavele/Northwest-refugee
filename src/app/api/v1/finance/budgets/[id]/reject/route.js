import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/finance/finance.service';
import * as schema from '@/server/modules/finance/finance.schema';

export const POST = route(
  { permission: PERMISSIONS.BUDGET_APPROVE, params: schema.idParamSchema, body: schema.rejectSchema },
  async ({ params, body, user, ctx }) => success(await service.rejectBudget(params.id, body, user, ctx))
);
