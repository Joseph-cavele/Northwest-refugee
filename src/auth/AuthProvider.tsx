'use client';

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { refreshSession } from '@/api/client';
import { getMe, logout as logoutRequest } from '@/api/auth.api';
import type { Session } from '@/api/auth.api';
import {
  clearAccessToken,
  setAccessToken,
  setExpiryHandler,
} from './tokenStore';
import { roleHasPermission } from './permissions';
import type { Permission } from './permissions';
import type { User } from '@/types/models';
import { DASHBOARD_BY_ROLE } from '@/types/enums';

/*
 * The session.
 *
 * Holds the signed-in user; the access token itself lives in `tokenStore` because the
 * fetch layer must read it without a hook. Nothing is persisted — see tokenStore for
 * why — so a reload starts at `loading` and trades the httpOnly refresh cookie for a
 * fresh token before deciding whether anyone is signed in.
 *
 * That third state matters. Without it, every guarded route flashes the sign-in screen
 * on reload before the refresh lands, which reads as being randomly logged out.
 */

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** Where this user's dashboard lives. Server-provided; falls back to the role table. */
  dashboard: string;
  /** Adopt a completed session — from login, MFA verification or invite acceptance. */
  signIn: (session: Session) => void;
  signOut: () => Promise<void>;
  /** Re-read /auth/me, e.g. after a profile edit. */
  reloadUser: () => Promise<void>;
  /**
   * Whether the role holds a permission. For deciding what to RENDER only — the server
   * re-checks everything. See permissions.ts.
   */
  can: (permission: Permission) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [dashboard, setDashboard] = useState('/dashboard');

  const adopt = useCallback((session: Session) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
    setDashboard(session.dashboard);
    setStatus('authenticated');
  }, []);

  const clear = useCallback(() => {
    clearAccessToken();
    setUser(null);
    setStatus('anonymous');
  }, []);

  /*
   * The fetch layer calls this when a refresh fails mid-session. It cannot navigate —
   * it has no router — so it reports here and RequireAuth does the redirect on the next
   * render.
   */
  useEffect(() => {
    setExpiryHandler(clear);
    return () => setExpiryHandler(null);
  }, [clear]);

  /*
   * Boot. StrictMode runs this twice in development; `refreshSession()` is single-flight
   * so both calls share one network request, and the AbortController stops the discarded
   * pass from writing state.
   */
  const bootRan = useRef(false);
  useEffect(() => {
    if (bootRan.current) return;
    bootRan.current = true;

    const controller = new AbortController();

    (async () => {
      try {
        const token = await refreshSession();
        if (controller.signal.aborted) return;

        if (!token) {
          setStatus('anonymous');
          return;
        }

        setAccessToken(token);
        const me = await getMe(controller.signal);
        if (controller.signal.aborted) return;

        setUser(me.user);
        setDashboard(me.dashboard);
        setStatus('authenticated');
      } catch {
        // No usable session. Not an error worth showing: this is the ordinary path for
        // anyone arriving signed out.
        if (!controller.signal.aborted) {
          clearAccessToken();
          setStatus('anonymous');
        }
      }
    })();

    return () => controller.abort();
  }, []);

  const signOut = useCallback(async () => {
    try {
      // Best-effort. The point is revoking the refresh token server-side; if the network
      // is down, the local session still has to end — staying signed in because logout
      // failed is the wrong way round on a shared office machine.
      await logoutRequest();
    } catch {
      // Deliberately swallowed.
    } finally {
      clear();
    }
  }, [clear]);

  const reloadUser = useCallback(async () => {
    const me = await getMe();
    setUser(me.user);
    setDashboard(me.dashboard);
  }, []);

  const can = useCallback(
    (permission: Permission) => roleHasPermission(user?.role, permission),
    [user?.role]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      // The server sends `dashboard` on sign-in; the role table is the fallback for a
      // cold reload where only /auth/me ran.
      dashboard: user ? (dashboard ?? DASHBOARD_BY_ROLE[user.role]) : dashboard,
      signIn: adopt,
      signOut,
      reloadUser,
      can,
    }),
    [status, user, dashboard, adopt, signOut, reloadUser, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
