import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/finance/finance.service';
import * as schema from '@/server/modules/finance/finance.schema';

/*
 * Amounts are integer cents, always positive. Direction is carried by `type`, never by the
 * sign — the zod schema takes rands from the client and the service converts immediately.
 */
export const POST = route(
  { permission: PERMISSIONS.TRANSACTION_CREATE, body: schema.createTransactionSchema },
  async ({ body, user, ctx }) => created(await service.createTransaction(body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.TRANSACTION_READ, query: schema.listTransactionsSchema },
  async ({ query }) => paginated(await service.listTransactions(query))
);
