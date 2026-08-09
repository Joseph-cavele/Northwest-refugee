import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from '@/components/ui/spinner';
import RequireAuth from '@/auth/RequireAuth';
import Login from '@/auth/pages/Login';
import { dashboardRoutes } from './dashboardRoutes';
import { PATHS } from './paths';

/*
 * The route table.
 *
 * Login is imported eagerly — it is the landing route, and code-splitting the first
 * thing every visitor sees only adds a round trip. Everything else is lazy.
 *
 * Routes with no page yet are simply absent; they fall through to NotFound, which is a
 * real page with real exits. A "not built yet" placeholder is a developer's note shown
 * to a caseworker.
 */

const RequestAccess = lazy(() => import('@/auth/pages/RequestAccess'));
const MfaChallenge = lazy(() => import('@/auth/pages/MfaChallenge'));
const AcceptInvite = lazy(() => import('@/auth/pages/AcceptInvite'));
const ForgotPassword = lazy(() => import('@/auth/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/auth/pages/ResetPassword'));
const NotFound = lazy(() => import('@/public-site/pages/NotFound'));

export function AppRoutes() {
  return (
    <Suspense fallback={<Spinner full label="Loading" />}>
      <Routes>
        <Route path={PATHS.home} element={<Navigate to={PATHS.signIn} replace />} />

        {/* --- unauthenticated --- */}
        <Route path={PATHS.signIn} element={<Login />} />
        <Route path={PATHS.requestAccess} element={<RequestAccess />} />
        <Route path={PATHS.mfa} element={<MfaChallenge />} />
        <Route path={PATHS.forgotPassword} element={<ForgotPassword />} />

        {/*
          * Root-level, because the server builds these two into its emails. Moving them
          * 404s every invitation and reset link already sent. See ./paths.ts.
          */}
        <Route path={PATHS.acceptInvite} element={<AcceptInvite />} />
        <Route path={PATHS.resetPassword} element={<ResetPassword />} />

        {/*
          * --- signed in ---
          * A layout route: everything nested inside waits for the session to resolve and
          * redirects to sign-in if there is none. Dashboard modules mount inside
          * dashboardRoutes as they are built; each one still guards its own data with
          * RequirePermission.
          */}
        <Route element={<RequireAuth />}>{dashboardRoutes}</Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
