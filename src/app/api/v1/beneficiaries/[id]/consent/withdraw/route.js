import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/beneficiaries/beneficiary.service';
import * as schema from '@/server/modules/beneficiaries/beneficiary.schema';

/*
 * Withdrawal stops further processing; it does not delete. Retention may be legally
 * required, and destroying a case history on request would break both continuity of care
 * and the audit trail — but nothing may keep processing after this.
 */
export const POST = route(
  { permission: PERMISSIONS.BENEFICIARY_UPDATE, params: schema.beneficiaryIdParamSchema, body: schema.withdrawConsentSchema },
  async ({ params, body, user, ctx }) => success(await service.withdrawConsent(params.id, body, user, ctx))
);
