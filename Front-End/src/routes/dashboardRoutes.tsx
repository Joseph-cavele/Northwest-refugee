import { lazy } from 'react';
import { Route } from 'react-router-dom';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { PATHS } from './paths';
import { DASHBOARD_BY_ROLE } from '@/types/enums';

/*
 * Everything behind a login.
 *
 * Rendered as a fragment of <Route> elements rather than a component, because React
 * Router only accepts <Route> as a child of <Routes> — a wrapper component here would
 * throw at runtime rather than fail the typecheck.
 *
 * THE ROLE LANDING ROUTES ARE DERIVED, NOT LISTED. The server sends `dashboard` with the
 * session (Backend/src/config/constants.js), and that value must match a route here or a
 * successful sign-in ends on the 404 page — a login that "does not work" with nothing in
 * any log to explain it. Generating them from the same map the client already mirrors
 * means adding a role cannot reintroduce that.
 *
 * All eight render the same Overview: GET /reports/cards already returns exactly what
 * the caller's role may see, so a per-role page would be a second copy of the permission
 * matrix. They stay distinct URLs because the server hands them out and people bookmark
 * them.
 */

const Overview = lazy(() => import('@/dashboard/dashboard/pages/Overview'));

/** '/dashboard/executive' → 'executive'. Child paths are relative to the parent route. */
const ROLE_SEGMENTS = [
  ...new Set(
    Object.values(DASHBOARD_BY_ROLE)
      .filter((path) => path.startsWith(`${PATHS.dashboard}/`))
      .map((path) => path.slice(PATHS.dashboard.length + 1))
  ),
];

export const dashboardRoutes = (
  <Route path={PATHS.dashboard} element={<DashboardLayout />}>
    {/* Bare /dashboard — the server's fallback for a role with no landing route. */}
    <Route index element={<Overview />} />

    {ROLE_SEGMENTS.map((segment) => (
      <Route key={segment} path={segment} element={<Overview />} />
    ))}

    {/*
      * Feature modules mount here as they are built, each wrapped in RequirePermission:
      *
      *   <Route element={<RequirePermission permission={PERMISSIONS.BENEFICIARY_READ} />}>
      *     <Route path="beneficiaries" element={<BeneficiaryList />} />
      *   </Route>
      *
      * Until then an unknown /dashboard/* path falls through to NotFound, which is a real
      * page with real exits — deliberately, rather than a placeholder that tells a
      * caseworker the software is unfinished.
      */}
  </Route>
);

export default dashboardRoutes;
