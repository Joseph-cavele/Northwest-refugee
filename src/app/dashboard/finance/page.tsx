import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { TransactionQueue } from '@/features/finance/TransactionQueue';

export const metadata: Metadata = { title: 'Finance' };

/*
 * Guarded on transaction:read, not on approve — a finance officer raises spend and reads
 * the ledger without ever approving any of it, and that separation is the point of the
 * module. What each row offers is decided per row; see lib/approval.ts.
 */
export default function FinancePage() {
  return (
    <RequirePermission permission={PERMISSIONS.TRANSACTION_READ}>
      <TransactionQueue />
    </RequirePermission>
  );
}
