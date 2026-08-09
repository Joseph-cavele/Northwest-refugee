import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/finance/finance.service';
import * as schema from '@/server/modules/finance/finance.schema';

export const POST = route(
  { permission: PERMISSIONS.PETTY_CASH_CREATE, params: schema.idParamSchema, body: schema.movementSchema },
  async ({ params, body, user, ctx }) => created(await service.recordMovement(params.id, body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.PETTY_CASH_READ, params: schema.idParamSchema, query: schema.listMovementsSchema },
  async ({ params, query }) => paginated(await service.listMovements(params.id, query))
);
