'use client';

import { useCallback, useState } from 'react';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { getDashboardCards, getMetrics } from '@/api/reports.api';
import type { CardGroup, DashboardCard, MetricRow } from '@/api/reports.api';
import { listCases, listUrgentCases } from '@/api/cases.api';
import { listNotifications } from '@/api/notifications.api';
import { formatDateTime } from '@/lib/dates';
import type { ProgrammePillar } from '@/types/enums';
import { StatCard } from '../components/StatCard';
import { AreaChart } from '../components/AreaChart';
import { PillarDonut } from '../components/PillarDonut';
import { RecentCases } from '../components/RecentCases';
import { NotificationsPanel } from '../components/NotificationsPanel';
import { UrgentQueue } from '../components/UrgentQueue';

/*
 * The screen every role lands on after signing in.
 *
 * ONE PAGE SERVES ALL EIGHT ROLES. The server already decides what each may see — the cards
 * endpoint returns only what the caller's permissions earn, scoped to their own caseload
 * where that applies. Branching per role here would be a second copy of the permission
 * matrix, and the copy that drifts is the one that leaks.
 *
 * EVERY PANEL IS GATED BEFORE IT IS FETCHED. `can()` decides whether to ask at all, so a
 * comms officer does not spend a request earning a 403 on a caseload they cannot see, and
 * the panel is ABSENT rather than empty. An empty panel says "there are no urgent cases";
 * the truth is "you cannot see cases", and the two must not look alike.
 *
 * NOTHING ON THIS PAGE IS INVENTED. Where the reference layout has a panel NWHR has no data
 * for — a guest-review list — there is no panel. A dashboard that fills space with plausible
 * numbers is worse than one with a gap in it, because a funder report is eventually built
 * from what is on this screen.
 */

const GROUP_HEADINGS: Record<CardGroup, string> = {
  register: 'The register',
  casework: 'Casework',
  programmes: 'Programmes',
  events: 'Events',
  finance: 'Finance',
  fundraising: 'Fundraising',
};

// Fixed order, so the page does not reshuffle itself between roles or reloads.
const GROUP_ORDER: CardGroup[] = [
  'register',
  'casework',
  'programmes',
  'events',
  'finance',
  'fundraising',
];

/** The measures worth putting on the hero chart, and what to call them. */
const TREND_OPTIONS = [
  { key: 'beneficiaries.registered', label: 'New registrations' },
  { key: 'cases.open', label: 'Open cases' },
  { key: 'service_requests.overdue', label: 'Overdue requests' },
  { key: 'donations.settled_value', label: 'Donation income' },
] as const;

function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col rounded-xl border border-line bg-surface ${className ?? ''}`}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold text-body">{title}</h2>
        {action}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

export default function Overview() {
  const { user, can } = useAuth();
  const [trend, setTrend] = useState<(typeof TREND_OPTIONS)[number]['key']>('cases.open');

  const mayReadMetrics = can(PERMISSIONS.METRIC_READ);
  const mayReadCases = can(PERMISSIONS.CASE_READ);

  const { data: cards, loading, error, reload } = useApi(
    useCallback((signal: AbortSignal) => getDashboardCards(signal), [])
  );

  const { data: series } = useApi<MetricRow[]>(
    useCallback(
      (signal: AbortSignal) =>
        mayReadMetrics ? getMetrics({ key: trend, limit: 90 }, signal) : Promise.resolve([]),
      [mayReadMetrics, trend]
    ),
    [trend, mayReadMetrics]
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
      (signal: AbortSignal) =>
        mayReadCases ? listUrgentCases({ limit: 6 }, signal) : Promise.resolve([]),
      [mayReadCases]
    ),
    [mayReadCases]
  );

  // Notifications need no permission — they are always the caller's own.
  const { data: notifications } = useApi(
    useCallback((signal: AbortSignal) => listNotifications({ limit: 5 }, signal), [])
  );

  const firstName = user?.name.split(' ')[0] ?? '';
  const selected = TREND_OPTIONS.find((option) => option.key === trend)!;

  // Only the most recent row per pillar — the series carries one row per day.
  const pillarCounts: Partial<Record<ProgrammePillar, number>> = {};
  for (const row of pillars ?? []) {
    if (row.dimensionValue) pillarCounts[row.dimensionValue as ProgrammePillar] = row.value;
  }

  const byGroup = (group: CardGroup): DashboardCard[] =>
    (cards?.cards ?? []).filter((card) => card.group === group);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-body">
            {firstName ? `Welcome back, ${firstName}` : 'Overview'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {cards ? `Figures as at ${formatDateTime(cards.generatedAt)}` : 'Your figures for today.'}
          </p>
        </div>
        <Button variant="subtle" onClick={reload}>
          Refresh
        </Button>
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

      {/* --- the hero trend, and the pillar split beside it --- */}
      {mayReadMetrics && (
        <div className="grid gap-6 xl:grid-cols-3">
          <Panel
            title={selected.label}
            className="xl:col-span-2"
            action={
              <label className="flex items-center gap-2 text-xs text-subtle">
                <span className="sr-only">Choose a measure</span>
                <select
                  value={trend}
                  onChange={(event) => setTrend(event.target.value as typeof trend)}
                  className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-body"
                >
                  {TREND_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            }
          >
            <div className="p-4">
              {series && series.length > 0 ? (
                <AreaChart
                  points={series.map((row) => ({ date: row.date, value: row.value }))}
                  unit={series[0]!.unit}
                  label={selected.label}
                />
              ) : (
                /*
                 * Truthful, not decorative. The series is written by the daily snapshot; if
                 * it has never run there is genuinely no history, and drawing a flat line at
                 * zero would state that nothing happened.
                 */
                <div className="grid min-h-52 place-items-center px-6 text-center">
                  <p className="max-w-sm text-sm text-muted">
                    No stored history yet. The daily snapshot writes one row per day — the
                    chart fills in from the first run.
                  </p>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Open requests by pillar">
            <div className="p-5">
              <PillarDonut counts={pillarCounts} />
            </div>
          </Panel>
        </div>
      )}

      {/* --- the KPI rows, grouped exactly as the server grouped them --- */}
      {cards &&
        GROUP_ORDER.filter((group) => byGroup(group).length > 0).map((group) => (
          <section key={group} aria-labelledby={`group-${group}`} className="flex flex-col gap-3">
            <h2
              id={`group-${group}`}
              className="text-xs font-semibold tracking-[0.09em] text-subtle uppercase"
            >
              {GROUP_HEADINGS[group]}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {byGroup(group).map((card) => (
                <StatCard key={card.key} card={card} />
              ))}
            </div>
          </section>
        ))}

      {/* --- casework, and what needs a person --- */}
      {mayReadCases && (
        <Panel title="Recently opened cases">
          <RecentCases cases={recentCases ?? []} />
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Notifications">
          <NotificationsPanel notifications={notifications ?? []} />
        </Panel>

        {mayReadCases && (
          <Panel title="Escalated and still open">
            <UrgentQueue cases={urgent ?? []} />
          </Panel>
        )}
      </div>

      {cards && cards.cards.length === 0 && !mayReadCases && (
        /*
         * Reachable: a role can hold report:read and none of the permissions behind any
         * individual card. Saying so is better than an empty page that looks broken — and
         * better than inventing zeros, which would state something untrue.
         */
        <p className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">
          There are no figures your role can see yet. Your work lives in the sections of the
          menu — ask an administrator if you expected something here.
        </p>
      )}
    </div>
  );
}
