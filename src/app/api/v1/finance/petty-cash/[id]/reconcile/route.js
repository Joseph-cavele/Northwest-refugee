import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/finance/finance.service';
import * as schema from '@/server/modules/finance/finance.schema';

/*
 * A custodian cannot reconcile their own float — counting your own cash and signing off on
 * the count is one person doing both halves of the control. Refused in the service.
 */
export const POST = route(
  { permission: PERMISSIONS.PETTY_CASH_RECONCILE, params: schema.idParamSchema, body: schema.reconcileSchema },
  async ({ params, body, user, ctx }) => success(await service.reconcileFloat(params.id, body, user, ctx))
);
