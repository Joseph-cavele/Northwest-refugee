import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { FinancialOverview } from '@/features/finance/FinancialOverview';

export const metadata: Metadata = { title: 'Financial overview' };

/*
 * Guarded on transaction:read, which every finance role holds. The budget position and the
 * fundraising figures are each gated separately inside the screen, so a comms officer's
 * summary is the fundraising half and a finance officer's is the ledger half — neither is
 * given a total that includes something they may not see.
 */
export default function FinancialOverviewPage() {
  return (
    <RequirePermission permission={PERMISSIONS.TRANSACTION_READ}>
      <FinancialOverview />
    </RequirePermission>
  );
}
