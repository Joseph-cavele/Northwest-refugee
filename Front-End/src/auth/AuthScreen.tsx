import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthSwitch } from '@/components/ui/auth-switch';
import type { AuthPanel } from '@/components/ui/auth-switch';
import type { Session } from '@/api/auth.api';
import { useAuth } from './useAuth';
import { PATHS } from '@/routes/paths';
import { SOCIAL_LINKS } from '@/lib/site';

interface RedirectState {
  from?: { pathname: string };
}

/*
 * The routing half of the auth switch.
 *
 * Everything here is navigation; the widget itself knows nothing about the router,
 * which is what lets it be rendered in a test or a storybook without one.
 *
 * The pane is driven by the URL rather than by component state, so Back and Forward
 * move between "sign in" and "request access" the way a person expects, and a link to
 * either one opens on the right side.
 */

export interface AuthScreenProps {
  panel: AuthPanel;
}

export function AuthScreen({ panel }: AuthScreenProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, signIn, dashboard } = useAuth();

  /*
   * Where to go after signing in: back to whatever RequireAuth interrupted, or the
   * server's dashboard for this role.
   */
  const from = (location.state as RedirectState | null)?.from?.pathname;

  /*
   * Already signed in — someone hit Back onto the login screen, or opened it from a
   * bookmark with a live session. Showing a login form to a signed-in user invites them
   * to re-enter credentials they do not need.
   */
  if (status === 'authenticated') {
    return <Navigate to={from ?? dashboard} replace />;
  }

  return (
    <AuthSwitch
      panel={panel}
      // Pushed, not replaced: toggling is a navigation the user can undo.
      onPanelChange={(next) =>
        navigate(next === 'register' ? PATHS.requestAccess : PATHS.signIn)
      }
      /*
       * `dashboard` comes from the server so the client keeps no copy of the
       * role-to-route table and the two cannot drift. It is a landing route, not an
       * authorisation decision — every dashboard is permission-guarded server-side.
       *
       * `replace` so Back does not return to a sign-in form the user has already used.
       */
      onAuthenticated={(session: Session) => {
        signIn(session);
        navigate(from ?? session.dashboard, { replace: true });
      }}
      /*
       * Router state, not a query parameter. A challenge token in the URL ends up in
       * browser history, the Referer header, and any proxy log in between.
       */
      onMfaRequired={(challengeToken) =>
        navigate(PATHS.mfa, { state: { challengeToken }, replace: true })
      }
      forgotPasswordHref={PATHS.forgotPassword}
      getHelpHref={PATHS.getHelp}
      socialLinks={SOCIAL_LINKS}
    />
  );
}
