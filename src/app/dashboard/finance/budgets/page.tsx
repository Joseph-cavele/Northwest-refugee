import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { BudgetList } from '@/features/finance/BudgetList';

export const metadata: Metadata = { title: 'Budgets' };

export default function BudgetsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.BUDGET_READ}>
      <BudgetList />
    </RequirePermission>
  );
}
