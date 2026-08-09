import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/beneficiaries/beneficiary.service';
import * as schema from '@/server/modules/beneficiaries/beneficiary.schema';

/*
 * POST, not GET, so the permit number stays out of the URL — and therefore out of access
 * logs, browser history and every proxy in between. The lookup itself never puts the
 * plaintext in a query either: it goes through the HMAC blind index.
 */
export const POST = route(
  { permission: PERMISSIONS.BENEFICIARY_READ_SENSITIVE, body: schema.permitLookupSchema },
  async ({ body, user, ctx }) => success(await service.findByPermitNumber(body.permitNumber, user, ctx))
);
