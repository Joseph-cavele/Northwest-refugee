'use client';

import { useCallback } from 'react';
import { CalendarDays, GraduationCap, HandCoins, Landmark, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { getDashboardCards, getMetrics } from '@/api/reports.api';
import type { DashboardCard, MetricRow } from '@/api/reports.api';
import { listCases, listUrgentCases } from '@/api/cases.api';
import { listNotifications } from '@/api/notifications.api';
import { formatDateTime } from '@/lib/dates';
import { ROLE_LABELS } from '@/types/enums';
import type { ProgrammePillar } from '@/types/enums';
import { KpiCard } from './components/KpiCard';
import { StatTile } from './components/StatTile';
import { SeriesChart } from './components/SeriesChart';
import { PillarBars } from './components/PillarBars';
import { RecentCases } from './components/RecentCases';
import { NotificationsPanel } from './components/NotificationsPanel';
import { UrgentQueue } from './components/UrgentQueue';
import { toPoints } from './lib/series';

/*
 * The screen every role lands on after signing in.
 *
 * ONE PAGE SERVES ALL EIGHT ROLES. The server already decides what each may see — the cards
 * endpoint returns only what the caller's permissions earn, scoped to their own caseload
 * where that applies. Branching per role here would be a second copy of the permission
 * matrix, and the copy that drifts is the one that leaks.
 *
 * EVERY PANEL IS GATED BEFORE IT FETCHES. `can()` decides whether to ask at all, so a comms
 * officer does not spend a request earning a 403 on a caseload they cannot see, and the
 * panel is ABSENT rather than empty. An empty panel says "there is no urgent work"; the
 * truth is "you cannot see cases", and those must not look alike.
 *
 * NOTHING HERE IS INVENTED. The reference this was built from carries a percentage under
 * every figure and a chart in every corner; those appear here only where the stored series
 * can support the arithmetic. A number nobody measured is worse than a blank space, because
 * a funder report is eventually built from what a person read on this screen.
 */

/** The four measures that lead. Chosen because each one, moving, changes somebody's day. */
const HEADLINE_KEYS = [
  'cases.open',
  'service_requests.overdue',
  'beneficiaries.registered',
  'donations.settled_value',
];

/** The secondary figures, and the logo figure each borrows for its chip. */
const TILES: { key: string; icon: LucideIcon; tone: 'brand' | 'accent' | 'gold' | 'danger' }[] = [
  { key: 'beneficiaries.active', icon: Users, tone: 'brand' },
  { key: 'enrollments.active', icon: GraduationCap, tone: 'gold' },
  { key: 'events.upcoming', icon: CalendarDays, tone: 'accent' },
  { key: 'transactions.pending_approval', icon: Landmark, tone: 'danger' },
  { key: 'donations.settled_count', icon: HandCoins, tone: 'brand' },
  { key: 'permits.expiring_30d', icon: Users, tone: 'danger' },
];

function Panel({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col rounded-xl border border-line bg-surface ${className ?? ''}`}>
      <header className="border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold text-body">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-subtle">{subtitle}</p>}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

/** Shown wherever a chart has no history yet. Says what would fill it, not just that it is empty. */
function AwaitingSnapshot() {
  return (
    <div className="max-w-xs text-center">
      <p className="text-sm text-muted">No history yet.</p>
      <p className="mt-1 text-xs text-subtle">
        The daily snapshot writes one row per day. Charts fill in from the first run.
      </p>
    </div>
  );
}

export default function Overview() {
  const { user, can } = useAuth();

  const mayReadMetrics = can(PERMISSIONS.METRIC_READ);
  const mayReadCases = can(PERMISSIONS.CASE_READ);

  const { data: cards, loading, error, reload } = useApi(
    useCallback((signal: AbortSignal) => getDashboardCards(signal), [])
  );

  // One request for every headline series, so four cards do not become four round trips.
  const { data: headlineSeries } = useApi<MetricRow[]>(
    useCallback(
      (signal: AbortSignal) =>
        mayReadMetrics ? getMetrics({ key: HEADLINE_KEYS, limit: 100 }, signal) : Promise.resolve([]),
      [mayReadMetrics]
    ),
    [mayReadMetrics]
  );

  const { data: throughput } = useApi<MetricRow[]>(
    useCallback(
      (signal: AbortSignal) =>
        mayReadMetrics
          ? getMetrics({ key: ['beneficiaries.registered', 'cases.closed'], limit: 100 }, signal)
          : Promise.resolve([]),
      [mayReadMetrics]
    ),
    [mayReadMetrics]
  );

  const { data: workload } = useApi<MetricRow[]>(
    useCallback(
      (signal: AbortSignal) =>
        mayReadMetrics
          ? getMetrics({ key: ['cases.open', 'service_requests.open'], limit: 100 }, signal)
          : Promise.resolve([]),
      [mayReadMetrics]
    ),
    [mayReadMetrics]
  );

  const { data: pillars } = useApi<MetricRow[]>(
    useCallback(
      (signal: AbortSignal) =>
        mayReadMetrics
          ? getMetrics({ key: 'service_requests.open', dimension: 'pillar', limit: 100 }, signal)
          : Promise.resolve([]),
      [mayReadMetrics]
    ),
    [mayReadMetrics]
  );

  const { data: recentCases } = useApi(
    useCallback(
      (signal: AbortSignal) =>
        mayReadCases
          ? listCases({ limit: 8, sort: '-openedAt', openOnly: true }, signal)
          : Promise.resolve([]),
      [mayReadCases]
    ),
    [mayReadCases]
  );

  const { data: urgent } = useApi(
    useCallback(
      (signal: AbortSignal) => (mayReadCases ? listUrgentCases({ limit: 5 }, signal) : Promise.resolve([])),
      [mayReadCases]
    ),
    [mayReadCases]
  );

  // Notifications need no permission — they are always the caller's own.
  const { data: notifications } = useApi(
    useCallback((signal: AbortSignal) => listNotifications({ limit: 5 }, signal), [])
  );

  const byKey = (key: string): DashboardCard | undefined =>
    cards?.cards.find((card) => card.key === key);

  const headlines = HEADLINE_KEYS.map(byKey).filter(Boolean) as DashboardCard[];
  const tiles = TILES.map((t) => ({ ...t, card: byKey(t.key) })).filter((t) => t.card);

  // The series carries one row per day; the newest per pillar is the current level.
  const pillarCounts: Partial<Record<ProgrammePillar, number>> = {};
  for (const row of pillars ?? []) {
    if (row.dimensionValue) pillarCounts[row.dimensionValue as ProgrammePillar] = row.value;
  }

  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <div className="flex flex-col gap-6">
      {/*
        * The signature: the four figures from the mark, as a spine.
        *
        * `.brand-rule` is NWHR's own device — a black house sheltering four figures in blue,
        * orange, gold and red — and it is the one place on this screen the full palette
        * appears at once. Everything else stays black-and-white with blue on the actions,
        * which is what the design system asks for and what keeps this from looking like the
        * purple admin template it was modelled on.
        */}
      <header className="relative overflow-hidden rounded-xl border border-line bg-surface">
        <div className="brand-rule absolute inset-y-0 left-0 w-1" aria-hidden="true" />
        <div className="flex flex-wrap items-end justify-between gap-4 py-5 pr-5 pl-6">
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-[0.16em] text-subtle uppercase">
              {user ? ROLE_LABELS[user.role] : 'Dashboard'}
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-body">
              {firstName ? `Welcome back, ${firstName}` : 'Overview'}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {cards ? `Figures as at ${formatDateTime(cards.generatedAt)}` : 'Loading your figures…'}
            </p>
          </div>
          <Button variant="subtle" onClick={reload}>
            Refresh
          </Button>
        </div>
      </header>

      {loading && !cards && <Spinner label="Loading your figures" className="py-16" />}

      {error && (
        <div className="flex flex-col items-start gap-3">
          <ErrorAlert error={error} />
          <Button variant="subtle" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {/* --- the four that lead --- */}
      {headlines.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {headlines.map((card) => (
            <KpiCard key={card.key} card={card} series={headlineSeries ?? []} />
          ))}
        </div>
      )}

      {/* --- two charts, each a pair that shares a unit and a kind --- */}
      {mayReadMetrics && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel
            title="Intake and completion"
            subtitle="People registered against cases closed — both counts, both per day"
          >
            <div className="p-4">
              <SeriesChart
                variant="bars"
                unit="COUNT"
                empty={<AwaitingSnapshot />}
                series={[
                  { key: 'registered', label: 'Registered', points: toPoints(throughput ?? [], 'beneficiaries.registered') },
                  { key: 'closed', label: 'Cases closed', points: toPoints(throughput ?? [], 'cases.closed') },
                ]}
              />
            </div>
          </Panel>

          <Panel
            title="Live workload"
            subtitle="What is open right now — levels, so the lines are not summed"
          >
            <div className="p-4">
              <SeriesChart
                variant="line"
                unit="COUNT"
                empty={<AwaitingSnapshot />}
                series={[
                  { key: 'cases', label: 'Open cases', points: toPoints(workload ?? [], 'cases.open') },
                  { key: 'requests', label: 'Open requests', points: toPoints(workload ?? [], 'service_requests.open') },
                ]}
              />
            </div>
          </Panel>
        </div>
      )}

      {/* --- the secondary figures --- */}
      {tiles.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {tiles.map((tile) => (
            <StatTile key={tile.key} card={tile.card!} icon={tile.icon} tone={tile.tone} />
          ))}
        </div>
      )}

      {/* --- where the work sits, and what needs a person --- */}
      <div className="grid gap-6 lg:grid-cols-3">
        {mayReadMetrics && (
          <Panel title="Where the work sits" subtitle="Open service requests by pillar">
            <div className="p-5">
              <PillarBars counts={pillarCounts} />
            </div>
          </Panel>
        )}

        {mayReadCases && (
          <Panel title="Needs a person today" subtitle="Escalated and still open, longest first">
            <UrgentQueue cases={urgent ?? []} />
          </Panel>
        )}

        <Panel title="Notifications" subtitle="Addressed to you">
          <NotificationsPanel notifications={notifications ?? []} />
        </Panel>
      </div>

      {/* --- the register itself --- */}
      {mayReadCases && (
        <Panel title="Recently opened cases" subtitle="The eight most recent files you can open">
          <RecentCases cases={recentCases ?? []} />
        </Panel>
      )}

      {cards && cards.cards.length === 0 && (
        /*
         * Reachable: a role can hold report:read and none of the permissions behind any
         * individual card. Saying so beats an empty page that reads as broken — and beats
         * inventing zeros, which would state something untrue.
         */
        <p className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">
          There are no figures your role can see yet. Your work lives in the sections of the
          menu — ask an administrator if you expected something here.
        </p>
      )}
    </div>
  );
}
