import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/finance/finance.service';
import * as schema from '@/server/modules/finance/finance.schema';

/** The service refuses self-approval regardless of permission — that check is the control. */
export const POST = route(
  { permission: PERMISSIONS.BUDGET_APPROVE, params: schema.idParamSchema },
  async ({ params, user, ctx }) => success(await service.approveBudget(params.id, user, ctx))
);
