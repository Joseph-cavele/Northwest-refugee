import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/finance/finance.service';
import * as schema from '@/server/modules/finance/finance.schema';

export const POST = route(
  { permission: PERMISSIONS.PETTY_CASH_CREATE, body: schema.createFloatSchema },
  async ({ body, user, ctx }) => created(await service.createFloat(body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.PETTY_CASH_READ, query: schema.listMovementsSchema },
  async ({ query }) => paginated(await service.listFloats(query))
);
