import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { EventEditor } from '@/features/events/EventEditor';

export const metadata: Metadata = { title: 'Edit event' };

/*
 * `event:update` gates the screen; publishing and deleting are gated again inside it by
 * their own permissions, so a coordinator sees the form and neither the publish switch nor
 * the delete panel.
 *
 * The guard here decides what to RENDER and nothing more — every route this screen calls
 * checks the same permission server-side, which is where the actual refusal lives.
 */
export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <RequirePermission permission={PERMISSIONS.EVENT_UPDATE}>
      <EventEditor id={id} />
    </RequirePermission>
  );
}
