import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/beneficiaries/beneficiary.service';
import * as schema from '@/server/modules/beneficiaries/beneficiary.schema';

/*
 * The register — the most sensitive collection in the system.
 *
 * Nothing here is public. Every guard names a permission, never a role, and row-level
 * scoping is applied separately inside the service: this layer only answers "may this role
 * call this endpoint at all", never "which rows".
 */

export const POST = route(
  { permission: PERMISSIONS.BENEFICIARY_CREATE, body: schema.createBeneficiarySchema },
  async ({ body, user, ctx }) => created(await service.createBeneficiary(body, user, ctx))
);

export const GET = route(
  { permission: PERMISSIONS.BENEFICIARY_READ, query: schema.listBeneficiariesSchema },
  async ({ query, user }) => paginated(await service.listBeneficiaries(query, user))
);
