import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { BeneficiaryList } from '@/features/beneficiaries/BeneficiaryList';

export const metadata: Metadata = { title: 'Beneficiaries' };

/*
 * The register, behind the permission that governs it.
 *
 * RequirePermission decides what to RENDER and nothing more — someone who reaches this URL
 * without beneficiary:read is told so rather than bounced, because a silent redirect reads
 * as a broken link and gets reported as one. The rows themselves are guarded server-side
 * and scoped per role, so defeating this guard in the console buys an explanation screen
 * and a string of 403s, never data.
 */
export default function BeneficiariesPage() {
  return (
    <RequirePermission permission={PERMISSIONS.BENEFICIARY_READ}>
      <BeneficiaryList />
    </RequirePermission>
  );
}
