import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { FundraisingOverview } from '@/features/fundraising/FundraisingOverview';

export const metadata: Metadata = { title: 'Fundraising' };

/*
 * Guarded on campaign:read — the campaigns are the page. The donation ledger and the
 * receipts panel are gated separately inside it, because a communications officer manages
 * campaigns without ever seeing who gave what.
 */
export default function FundraisingPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CAMPAIGN_READ}>
      <FundraisingOverview />
    </RequirePermission>
  );
}
