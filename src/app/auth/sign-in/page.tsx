import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Spinner } from '@/components/ui/spinner';
import Login from '@/auth/screens/Login';

export const metadata: Metadata = { title: 'Sign in' };

/*
 * useSearchParams() (AuthScreen reads `?from=`) forces everything below it into client
 * rendering, and Next requires that boundary to be declared. Without the Suspense wrapper
 * the build fails with "useSearchParams should be wrapped in a suspense boundary".
 */
export default function SignInPage() {
  return (
    <Suspense fallback={<Spinner full label="Loading sign in" />}>
      <Login />
    </Suspense>
  );
}
