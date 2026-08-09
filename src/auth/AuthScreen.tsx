'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthSwitch } from '@/components/ui/auth-switch';
import type { AuthPanel } from '@/components/ui/auth-switch';
import type { Session } from '@/api/auth.api';
import { useAuth } from './useAuth';
import { PATHS } from '@/routes/paths';
import { SOCIAL_LINKS } from '@/lib/site';
import { setMfaChallenge } from './mfaChallengeStore';

/**
 * Only an in-app path is honoured as a post-sign-in destination.
 *
 * `?from=` is attacker-controlled — it arrives in a link anyone can send. Without this,
 * `?from=https://evil.example` is an open redirect that hands a freshly signed-in staff
 * member to a copy of this login screen. A leading `//` is a protocol-relative URL and is
 * refused for the same reason.
 */
function safeReturnPath(value: string | null): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith('/') || value.startsWith('//')) return undefined;
  return value;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, signIn, dashboard } = useAuth();

  /*
   * Where to go after signing in: back to whatever RequireAuth interrupted, or the
   * server's dashboard for this role. Validated, because `?from=` comes off the URL.
   */
  const from = safeReturnPath(searchParams.get('from'));

  /*
   * Already signed in — someone hit Back onto the login screen, or opened it from a
   * bookmark with a live session. Showing a login form to a signed-in user invites them
   * to re-enter credentials they do not need.
   *
   * An effect rather than a rendered <Navigate>: router.replace() mutates history, which
   * is not something to do while React is still deciding what to draw.
   */
  useEffect(() => {
    if (status === 'authenticated') router.replace(from ?? dashboard);
  }, [status, from, dashboard, router]);

  return (
    <AuthSwitch
      panel={panel}
      // Pushed, not replaced: toggling is a navigation the user can undo.
      onPanelChange={(next) =>
        router.push(next === 'register' ? PATHS.requestAccess : PATHS.signIn)
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
        router.replace(from ?? session.dashboard);
      }}
      /*
       * Memory, not a query parameter — see auth/mfaChallengeStore.ts. React Router
       * carried this in router state; the App Router has no equivalent, and a challenge
       * token in the URL ends up in browser history, the Referer header, and any proxy
       * log in between.
       */
      onMfaRequired={(challengeToken) => {
        setMfaChallenge(challengeToken);
        router.replace(PATHS.mfa);
      }}
      forgotPasswordHref={PATHS.forgotPassword}
      getHelpHref={PATHS.getHelp}
      socialLinks={SOCIAL_LINKS}
    />
  );
}
