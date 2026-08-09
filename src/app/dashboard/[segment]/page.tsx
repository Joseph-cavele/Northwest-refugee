import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Overview from '@/features/overview/Overview';
import { DASHBOARD_BY_ROLE } from '@/types/enums';
import { PATHS } from '@/lib/paths';

export const metadata: Metadata = { title: 'Overview' };

/*
 * The eight role landing routes — /dashboard/executive, /dashboard/finance and so on.
 *
 * DERIVED, NOT LISTED. The server sends `dashboard` with the session
 * (src/server/config/constants.js DASHBOARD_BY_ROLE), and that value must match a route
 * here or a *successful* sign-in ends on the 404 page, with nothing in any log to say so.
 * Generating the set from the same map the client already mirrors means adding a role
 * cannot reintroduce that.
 *
 * All eight render the same Overview: GET /api/v1/reports/cards already returns exactly
 * what the caller's role may see, so a per-role page would be a second copy of the
 * permission matrix — and the copy that drifts is the one that leaks. They stay distinct
 * URLs because the server hands them out and people bookmark them.
 */

/** '/dashboard/executive' → 'executive'. */
const ROLE_SEGMENTS = new Set(
  Object.values(DASHBOARD_BY_ROLE)
    .filter((path) => path.startsWith(`${PATHS.dashboard}/`))
    .map((path) => path.slice(PATHS.dashboard.length + 1))
);

/**
 * Enumerated at build time so these are static routes rather than a catch-all that
 * matches anything under /dashboard. A dynamic segment is how an unbuilt module would
 * quietly render an Overview instead of a 404.
 */
export function generateStaticParams() {
  return [...ROLE_SEGMENTS].map((segment) => ({ segment }));
}

export default async function RoleDashboardPage({
  params,
}: {
  params: Promise<{ segment: string }>;
}) {
  const { segment } = await params;

  // Anything that is not a known landing route falls through to the real 404, which has
  // real exits — deliberately, rather than a placeholder telling a caseworker the
  // software is unfinished.
  if (!ROLE_SEGMENTS.has(segment)) notFound();

  return <Overview />;
}
