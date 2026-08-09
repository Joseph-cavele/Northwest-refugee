import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Spinner } from '@/components/ui/spinner';
import ResetPassword from '@/auth/screens/ResetPassword';

export const metadata: Metadata = { title: 'Choose a new password' };

/*
 * ROOT-LEVEL, AND NOT A FREE CHOICE — same reason as /accept-invite. The server builds
 * `${APP_URL}/reset-password?token=…` into the recovery email.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Spinner full label="Loading" />}>
      <ResetPassword />
    </Suspense>
  );
}
