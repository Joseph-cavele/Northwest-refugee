import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { BeneficiaryIntake } from '@/features/beneficiaries/BeneficiaryIntake';

export const metadata: Metadata = { title: 'Register someone' };

/*
 * `/new` sits beside `[id]`, and Next resolves the static segment first — so this is not
 * ambiguous with a beneficiary whose id happened to be "new", which cannot exist anyway
 * since ids are 24 hex characters.
 *
 * beneficiary:create is held by the roles that meet people: Admin Officer, Project
 * Coordinator, Peer Leader and Volunteer. The Executive Director is deliberately not among
 * them — the director oversees the register rather than taking intakes at the desk.
 */
export default function NewBeneficiaryPage() {
  return (
    <RequirePermission permission={PERMISSIONS.BENEFICIARY_CREATE}>
      <BeneficiaryIntake />
    </RequirePermission>
  );
}
