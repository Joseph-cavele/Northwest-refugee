import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/finance/finance.service';
import * as schema from '@/server/modules/finance/finance.schema';

/** Allocated, committed and spent per line — what is actually left to spend. */
export const GET = route(
  { permission: PERMISSIONS.BUDGET_READ, params: schema.idParamSchema },
  async ({ params }) => success(await service.getBudgetPosition(params.id))
);
