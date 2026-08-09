import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/finance/finance.service';
import * as schema from '@/server/modules/finance/finance.schema';

export const GET = route(
  { permission: PERMISSIONS.PETTY_CASH_READ, params: schema.idParamSchema },
  async ({ params }) => success(await service.getFloatById(params.id))
);
