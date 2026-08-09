import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Spinner } from '@/components/ui/spinner';
import AcceptInvite from '@/auth/pages/AcceptInvite';

export const metadata: Metadata = { title: 'Accept your invitation' };

/*
 * ROOT-LEVEL, AND NOT A FREE CHOICE. The server builds invitation emails as
 * `${APP_URL}/accept-invite?token=…` (src/server/modules/notifications/email.service.js).
 * Those links are already sitting in people's inboxes; moving this under /auth would 404
 * every outstanding invitation, including ones sent months ago.
 */
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<Spinner full label="Loading your invitation" />}>
      <AcceptInvite />
    </Suspense>
  );
}
