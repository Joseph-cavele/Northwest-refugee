import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/fundraising/fundraising.service';
import * as schema from '@/server/modules/fundraising/fundraising.schema';

export const POST = route(
  { permission: PERMISSIONS.DONOR_CREATE, body: schema.createDonorSchema },
  async ({ body, user, ctx }) => created(await service.createDonor(body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.DONOR_READ, query: schema.listDonorsSchema },
  async ({ query, user }) => paginated(await service.listDonors(query, user))
);
