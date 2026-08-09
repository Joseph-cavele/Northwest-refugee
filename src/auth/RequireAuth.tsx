'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from './useAuth';
import { PATHS } from '@/routes/paths';

/*
 * Gate for everything behind a login.
 *
 * A convenience, not a security boundary. Every request it protects is separately
 * authenticated server-side, so defeating this in the console buys an empty screen and
 * a string of 401s — never data.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  /*
   * The redirect is an effect, not a render.
   *
   * React Router let a guard `return <Navigate />` — rendering the decision was the
   * decision. Next's router.replace() is an imperative call, and calling it during render
   * mutates history while React is still deciding what to draw. So the component renders
   * the spinner and the effect navigates.
   *
   * `?from=` carries the interrupted destination. Router state was the right home for it
   * under React Router; here there is no state channel across a navigation, and the query
   * string is safe for this because a pathname is not a secret. The MFA challenge token,
   * which IS one, still never travels this way — see the sign-in screen.
   */
  useEffect(() => {
    if (status !== 'anonymous') return;
    const from = pathname && pathname !== PATHS.signIn ? `?from=${encodeURIComponent(pathname)}` : '';
    router.replace(`${PATHS.signIn}${from}`);
  }, [status, pathname, router]);

  /*
   * `loading` must render neither the page nor a redirect. On a reload the session is
   * unknown until the refresh cookie has been spent, and redirecting during that window
   * bounces a signed-in user to the login screen every time they press F5.
   *
   * `anonymous` renders the same spinner rather than null: the effect above is already
   * navigating, and a blank screen for that frame reads as a broken page.
   */
  if (status !== 'authenticated') {
    return <Spinner full label="Checking your session" />;
  }

  return <>{children}</>;
}

export default RequireAuth;
