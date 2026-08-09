import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/fundraising/fundraising.service';
import * as schema from '@/server/modules/fundraising/fundraising.schema';

/*
 * Recording an OFFLINE gift — cash at an event, an EFT into the bank account. Gateway
 * settlements arrive through the Paystack webhook and never through a person, which is why
 * that path is separate and idempotent.
 */
export const POST = route(
  { permission: PERMISSIONS.DONATION_CREATE, body: schema.recordDonationSchema },
  async ({ body, user, ctx }) => created(await service.recordDonation(body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.DONATION_READ, query: schema.listDonationsSchema },
  async ({ query }) => paginated(await service.listDonations(query))
);
