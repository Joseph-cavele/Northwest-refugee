import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { IntakeQueue } from '@/features/intake/IntakeQueue';

export const metadata: Metadata = { title: 'Intake' };

/*
 * `/dashboard/intake` — the waiting room, and deliberately not part of /beneficiaries.
 *
 * Nobody on this screen is on the register. Putting the queue inside the register's section
 * would say the opposite, and the whole point of the module is that asking for help and
 * being taken on are two different states.
 */
export default function IntakePage() {
  return (
    <RequirePermission permission={PERMISSIONS.INTAKE_READ}>
      <IntakeQueue />
    </RequirePermission>
  );
}
