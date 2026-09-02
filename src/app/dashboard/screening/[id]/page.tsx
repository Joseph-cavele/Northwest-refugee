import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { ScreeningWizard } from '@/features/screening/ScreeningWizard';

export const metadata: Metadata = { title: 'Screening' };

/*
 * `screening:conduct` gates the screen; the DECISION is gated again inside it by
 * `screening:decide`. A peer leader can do the screening and will be told, in the decision
 * step, who finishes it — which is more useful than a step that is simply missing.
 */
export default async function ScreeningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <RequirePermission permission={PERMISSIONS.SCREENING_CONDUCT}>
      <ScreeningWizard id={id} />
    </RequirePermission>
  );
}
