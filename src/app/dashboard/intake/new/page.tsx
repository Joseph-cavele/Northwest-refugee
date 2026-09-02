import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { WalkInIntake } from '@/features/intake/WalkInIntake';

export const metadata: Metadata = { title: 'New walk-in intake' };

/*
 * `intake:create` — held by the roles that meet people at the desk, including volunteers and
 * peer leaders. Writing down that somebody came in is the one thing everybody front-of-house
 * can do; deciding about them is not, and lives behind `screening:decide`.
 */
export default function NewIntakePage() {
  return (
    <RequirePermission permission={PERMISSIONS.INTAKE_CREATE}>
      <WalkInIntake />
    </RequirePermission>
  );
}
