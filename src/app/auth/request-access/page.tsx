import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Spinner } from '@/components/ui/spinner';
import RequestAccess from '@/auth/pages/RequestAccess';

export const metadata: Metadata = { title: 'Request access' };

/*
 * A route of its own rather than a state only reachable by clicking, so the link can be
 * put in a job advert or sent to someone directly.
 */
export default function RequestAccessPage() {
  return (
    <Suspense fallback={<Spinner full label="Loading" />}>
      <RequestAccess />
    </Suspense>
  );
}
