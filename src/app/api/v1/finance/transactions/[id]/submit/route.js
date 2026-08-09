import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/finance/finance.service';
import * as schema from '@/server/modules/finance/finance.schema';

export const POST = route(
  { permission: PERMISSIONS.TRANSACTION_CREATE, params: schema.idParamSchema },
  async ({ params, user, ctx }) => success(await service.submitTransaction(params.id, user, ctx))
);
