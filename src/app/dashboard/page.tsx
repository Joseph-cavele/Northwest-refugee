import type { Metadata } from 'next';
import Overview from '@/features/overview/Overview';

export const metadata: Metadata = { title: 'Overview' };

/** Bare /dashboard — the server's fallback landing route for a role with no specific one. */
export default function DashboardPage() {
  return <Overview />;
}
