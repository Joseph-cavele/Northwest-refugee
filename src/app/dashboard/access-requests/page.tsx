import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { AccessRequestQueue } from '@/features/staff/AccessRequestQueue';

export const metadata: Metadata = { title: 'Access requests' };

/*
 * Guarded on access_request:read — reading the queue. Deciding on a request needs
 * access_request:review, which is a separate permission because approving is what mints a
 * staff account; the approve and reject buttons are gated on it inside the screen.
 *
 * The M&E Officer holds read and not review, which is exactly the case this split exists
 * for: they can see who is waiting without being able to let anyone in.
 */
export default function AccessRequestsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ACCESS_REQUEST_READ}>
      <AccessRequestQueue />
    </RequirePermission>
  );
}
