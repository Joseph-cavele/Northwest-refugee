import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { ProgrammeList } from '@/features/programmes/ProgrammeList';

export const metadata: Metadata = { title: 'Programmes' };

/*
 * The catalogue, behind the permission that governs it. Coordinators are additionally
 * scoped server-side to the programmes they are named on, which this guard knows nothing
 * about and does not need to.
 */
export default function ProgrammesPage() {
  return (
    <RequirePermission permission={PERMISSIONS.PROGRAMME_READ}>
      <ProgrammeList />
    </RequirePermission>
  );
}
