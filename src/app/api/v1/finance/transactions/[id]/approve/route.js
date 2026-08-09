import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/finance/finance.service';
import * as schema from '@/server/modules/finance/finance.schema';

/*
 * Approval posts the entry to the ledger. Two controls sit behind this route and neither
 * is the permission: the creator can never approve their own, and an amount above the
 * approver's ceiling escalates to the Executive Director. Both live in finance.service.js.
 */
export const POST = route(
  { permission: PERMISSIONS.TRANSACTION_APPROVE, params: schema.idParamSchema },
  async ({ params, user, ctx }) => success(await service.approveTransaction(params.id, user, ctx))
);
