import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { ServiceRequestList } from '@/features/serviceRequests/ServiceRequestList';

export const metadata: Metadata = { title: 'Service requests' };

/*
 * The queue, behind the permission that governs it.
 *
 * The URL is hyphenated to match the API path and the rest of the app's routes; the feature
 * directory is camelCase to match `src/server/modules/serviceRequests/`. Both conventions
 * are pre-existing and neither is worth breaking for symmetry with the other.
 */
export default function ServiceRequestsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.SERVICE_REQUEST_READ}>
      <ServiceRequestList />
    </RequirePermission>
  );
}
