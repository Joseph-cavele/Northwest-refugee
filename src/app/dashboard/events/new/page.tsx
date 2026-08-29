import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { EventForm } from '@/features/events/EventForm';

export const metadata: Metadata = { title: 'New event' };

/*
 * `/new` sits beside `[id]`, and Next resolves the static segment first — so this is not
 * ambiguous with an event whose id happened to be "new", which cannot exist anyway since
 * ids are 24 hex characters. Same arrangement as the beneficiary register.
 *
 * `event:create` and nothing more. Publishing what is created here needs `event:publish`,
 * which is a different permission held by different roles — so a coordinator can plan an
 * event and prepare its public copy, and somebody else decides it goes live.
 */
export default function NewEventPage() {
  return (
    <RequirePermission permission={PERMISSIONS.EVENT_CREATE}>
      <EventForm />
    </RequirePermission>
  );
}
