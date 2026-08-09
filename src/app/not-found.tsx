import NotFoundPage from '@/public-site/pages/NotFound';

/*
 * The 404, as the App Router's convention.
 *
 * Reached by an unmatched URL and by any notFound() call — which is how
 * /dashboard/<unknown> lands here rather than rendering an empty dashboard.
 */
export default function NotFound() {
  return <NotFoundPage />;
}
