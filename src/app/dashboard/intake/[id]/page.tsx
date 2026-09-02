import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { IntakeDetail } from '@/features/intake/IntakeDetail';

export const metadata: Metadata = { title: 'Application' };

export default async function IntakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <RequirePermission permission={PERMISSIONS.INTAKE_READ}>
      <IntakeDetail id={id} />
    </RequirePermission>
  );
}
