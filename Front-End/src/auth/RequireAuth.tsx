import { Navigate, Outlet, useLocation } from 'react-router-dom';
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
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  /*
   * `loading` must render neither the page nor a redirect. On a reload the session is
   * unknown until the refresh cookie has been spent, and redirecting during that window
   * bounces a signed-in user to the login screen every time they press F5.
   */
  if (status === 'loading') {
    return <Spinner full label="Checking your session" />;
  }

  if (status === 'anonymous') {
    /*
     * Remember where they were headed so sign-in can return them there. `replace` keeps
     * the guarded URL out of history — otherwise Back lands on it again and bounces.
     */
    return <Navigate to={PATHS.signIn} replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default RequireAuth;
