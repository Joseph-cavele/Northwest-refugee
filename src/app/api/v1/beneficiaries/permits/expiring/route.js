import { route } from '@/server/http/route';
import { paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/beneficiaries/beneficiary.service';
import * as schema from '@/server/modules/beneficiaries/beneficiary.schema';

/*
 * Deliberately routed through listBeneficiaries, NOT service.findExpiringPermits: that
 * function is unscoped for the cron job's benefit, and exposing it over HTTP would hand a
 * volunteer the whole register.
 */
export const GET = route(
  { permission: PERMISSIONS.BENEFICIARY_READ, query: schema.listBeneficiariesSchema },
  async ({ query, user }) => {
    const withDefault = { ...query };
    if (withDefault.permitExpiringWithinDays === undefined) withDefault.permitExpiringWithinDays = 30;
    return paginated(await service.listBeneficiaries(withDefault, user));
  }
);
