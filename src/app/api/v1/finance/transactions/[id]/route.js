import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/finance/finance.service';
import * as schema from '@/server/modules/finance/finance.schema';

export const GET = route(
  { permission: PERMISSIONS.TRANSACTION_READ, params: schema.idParamSchema },
  async ({ params }) => success(await service.getTransactionById(params.id))
);

/** DRAFT only. A posted entry is immutable at the model layer — corrections are reversals. */
export const PATCH = route(
  { permission: PERMISSIONS.TRANSACTION_CREATE, params: schema.idParamSchema, body: schema.updateTransactionSchema },
  async ({ params, body, user, ctx }) => success(await service.updateTransaction(params.id, body, user, ctx))
);
