import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { EventList } from '@/features/events/EventList';

export const metadata: Metadata = { title: 'Events' };

export default function EventsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.EVENT_READ}>
      <EventList />
    </RequirePermission>
  );
}
