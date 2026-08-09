import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/finance/finance.service';
import * as schema from '@/server/modules/finance/finance.schema';

/*
 * The ONLY way to correct a posted entry.
 *
 * Posted transactions are immutable — a pre-save hook blocks edits at the model layer.
 * This writes a matching REVERSAL and links the pair; neither row is ever edited or
 * removed, because the pair IS the correction and an auditor must see both.
 */
export const POST = route(
  { permission: PERMISSIONS.TRANSACTION_APPROVE, params: schema.idParamSchema, body: schema.reverseSchema },
  async ({ params, body, user, ctx }) => success(await service.reverseTransaction(params.id, body, user, ctx))
);
