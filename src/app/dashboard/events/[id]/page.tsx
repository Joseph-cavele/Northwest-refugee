import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { EventDetail } from '@/features/events/EventDetail';

export const metadata: Metadata = { title: 'Event' };

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <RequirePermission permission={PERMISSIONS.EVENT_READ}>
      <EventDetail id={id} />
    </RequirePermission>
  );
}
