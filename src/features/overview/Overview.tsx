'use client';

import { useCallback } from 'react';
import { CalendarDays, FolderOpen, GraduationCap, HandCoins } from 'lucide-react';
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
import type { ProgrammePillar } from '@/types/enums';
import { KpiCard } from './components/KpiCard';
import { StatTile } from './components/StatTile';
import { HeroCard } from './components/HeroCard';
import { SeriesChart } from './components/SeriesChart';
import { PillarBars } from './components/PillarBars';
import { RatioGauge } from './components/RatioGauge';
import { AlertsStrip } from './components/AlertsStrip';
import { RecentCases } from './components/RecentCases';
import { UrgentQueue } from './components/UrgentQueue';
import { sumIntoWeeks, toPoints } from './lib/series';
import { deriveAlerts } from './lib/alerts';

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

/** The hero: who is on the register, and how many arrived this month. */
const HERO_KEY = 'beneficiaries.active';
const HERO_SUPPORTING_KEY = 'beneficiaries.registered';

/*
 * The two figures that mean somebody has to do something today.
 *
 * The reference puts its two emphasis cards next to the hero and gives them the same weight
 * as the headline. That is right, and these are the two that earn it: an overdue request
 * and an escalated case are both a person waiting. Everything else on this screen is
 * context.
 */
const EMPHASIS_KEYS = ['service_requests.overdue', 'cases.escalated'];

/** The secondary figures, and the logo figure each borrows for its chip. */
const TILES: { key: string; icon: LucideIcon; tone: 'brand' | 'accent' | 'gold' | 'danger' }[] = [
  { key: 'cases.open', icon: FolderOpen, tone: 'brand' },
  { key: 'enrollments.active', icon: GraduationCap, tone: 'gold' },
  { key: 'events.upcoming', icon: CalendarDays, tone: 'accent' },
  { key: 'donations.settled_value', icon: HandCoins, tone: 'brand' },
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

  // One request for both emphasis series, so two cards do not become two round trips.
  const { data: headlineSeries } = useApi<MetricRow[]>(
    useCallback(
      (signal: AbortSignal) =>
        mayReadMetrics ? getMetrics({ key: EMPHASIS_KEYS, limit: 100 }, signal) : Promise.resolve([]),
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

  // Both case endpoints are paginated; these two panels want the rows, not the totals.
  const { data: recentCases } = useApi(
    useCallback(
      (signal: AbortSignal) =>
        mayReadCases
          ? listCases({ limit: 8, sort: '-openedAt', openOnly: true }, signal).then((p) => p.data)
          : Promise.resolve([]),
      [mayReadCases]
    ),
    [mayReadCases]
  );

  const { data: urgent } = useApi(
    useCallback(
      (signal: AbortSignal) =>
        mayReadCases
          ? listUrgentCases({ limit: 5 }, signal).then((p) => p.data)
          : Promise.resolve([]),
      [mayReadCases]
    ),
    [mayReadCases]
  );

  const byKey = (key: string): DashboardCard | undefined =>
    cards?.cards.find((card) => card.key === key);

  const emphasis = EMPHASIS_KEYS.map(byKey).filter(Boolean) as DashboardCard[];

  /*
   * Derived from two cards the server already sent, not from a third request — and only
   * when BOTH are present. A role that can see overdue work but not the open total would
   * otherwise get a percentage of an unknown, which is a number with no meaning.
   */
  const openRequests = byKey('service_requests.open');
  const overdueRequests = byKey('service_requests.overdue');
  const overdueRatio =
    openRequests && overdueRequests
      ? { open: openRequests.value, overdue: overdueRequests.value }
      : null;
  const tiles = TILES.map((t) => ({ ...t, card: byKey(t.key) })).filter((t) => t.card);

  /*
   * Derived from the cards already on hand, so the permission gating comes for free: the
   * server only sent cards this role earns, and a rule with no card behind it stays quiet.
   */
  const alerts = deriveAlerts(cards?.cards ?? []);

  // The series carries one row per day; the newest per pillar is the current level.
  const pillarCounts: Partial<Record<ProgrammePillar, number>> = {};
  for (const row of pillars ?? []) {
    if (row.dimensionValue) pillarCounts[row.dimensionValue as ProgrammePillar] = row.value;
  }

  return (
    <div className="flex flex-col gap-6">
      {loading && !cards && <Spinner label="Loading your figures" className="py-16" />}

      {error && (
        <div className="flex flex-col items-start gap-3">
          <ErrorAlert error={error} />
          <Button variant="subtle" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {/*
        * --- the headline, and the two things that need a person today ---
        *
        * The reference gives its hero card roughly half the row and stacks two emphasis
        * cards beside it. Same proportions here, because the same thing is true of the
        * content: one figure describes the work, and two describe what is slipping.
        */}
      {cards && (
        <div className="grid gap-4 lg:grid-cols-3">
          <HeroCard
            className="lg:col-span-2"
            name={user?.name}
            role={user?.role}
            headline={byKey(HERO_KEY)}
            supporting={byKey(HERO_SUPPORTING_KEY)}
            generatedAt={cards.generatedAt}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {emphasis.map((card) => (
              <KpiCard key={card.key} card={card} series={headlineSeries ?? []} />
            ))}
            {emphasis.length === 0 && (
              // Absent rather than zeroed: a role without casework cannot see a caseload,
              // and "0 overdue" would be a claim about one.
              <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
                Your role does not include casework, so nothing is queued for you here.
              </p>
            )}
          </div>
        </div>
      )}

      {/*
        * --- what needs a person today ---
        *
        * High on the page but below the greeting, so the reader is oriented before being
        * handed a problem. Absent when nothing has fired, apart from one muted line — a
        * reader who sees nothing cannot tell whether the check ran.
        */}
      {cards && <AlertsStrip alerts={alerts} />}

      {/* --- the four supporting figures --- */}
      {tiles.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((tile) => (
            <StatTile key={tile.key} card={tile.card!} icon={tile.icon} tone={tile.tone} />
          ))}
        </div>
      )}

      {/*
        * --- the chart row: a ratio, a ranked list, and the wide chart ---
        *
        * The reference's proportions, roughly 1:1:2, because the same thing is true of the
        * content: two narrow panels that answer "how bad" and "where", and a wide one that
        * answers "which way is it going". The wide chart earns the width — a grouped bar
        * over 46 days is unreadable in a quarter of a row.
        */}
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        {overdueRatio && (
          <Panel title="How much is late" subtitle="Open service requests past their standard">
            <div className="p-5">
              <RatioGauge
                value={overdueRatio.overdue}
                total={overdueRatio.open}
                label="past due"
                caption={`${overdueRatio.overdue} of ${overdueRatio.open} open requests are past the service standard for their urgency.`}
                highIsBad
              />
            </div>
          </Panel>
        )}

        {mayReadMetrics && (
          <Panel title="Where the work sits" subtitle="Open service requests by pillar">
            <div className="p-5">
              <PillarBars counts={pillarCounts} />
            </div>
          </Panel>
        )}

        {mayReadMetrics && (
          <Panel
            className="xl:col-span-2"
            title="Intake and completion"
            subtitle="People registered against cases closed, by week"
          >
            <div className="p-4">
              {/*
                * Summed into weeks, not drawn per day. Forty-six daily slots gave each bar
                * about three pixels — a texture rather than a comparison.
                *
                * The sum is legitimate because BOTH of these are FLOW metrics: an amount
                * over a period, so a week really is the total of its days. The chart below
                * it plots levels and is deliberately left daily, because adding seven days
                * of "open cases" would produce a number seven times larger than anything
                * that was ever true.
                */}
              <SeriesChart
                variant="bars"
                unit="COUNT"
                empty={<AwaitingSnapshot />}
                series={[
                  {
                    key: 'registered',
                    label: 'Registered',
                    points: sumIntoWeeks(toPoints(throughput ?? [], 'beneficiaries.registered')),
                  },
                  {
                    key: 'closed',
                    label: 'Cases closed',
                    points: sumIntoWeeks(toPoints(throughput ?? [], 'cases.closed')),
                  },
                ]}
              />
            </div>
          </Panel>
        )}
      </div>

      {/* --- the trend, and what needs a person --- */}
      <div className="grid gap-6 lg:grid-cols-3">
        {mayReadMetrics && (
          <Panel
            className="lg:col-span-2"
            title="Live workload"
            subtitle="What is open right now — levels, so the lines are never summed"
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
        )}

        {/*
          * Notifications used to sit here too. They now live behind the topbar's bell,
          * where the unread count already is — the same list in two places on one screen
          * taught the reader that one of them was not worth checking.
          */}
        {mayReadCases && (
          <Panel title="Needs a person today" subtitle="Escalated and still open, longest first">
            <UrgentQueue cases={urgent ?? []} />
          </Panel>
        )}
      </div>

      {/* --- the register itself --- */}
      {mayReadCases && (
        <Panel
          title="Recently opened cases"
          /*
           * "you can open" is not filler. These rows are already row-scoped server-side, so
           * a coordinator's list is their programmes and a volunteer's is what they
           * captured — saying so stops the count reading as the organisation's total.
           */
          subtitle={
            recentCases && recentCases.length > 0
              ? `${recentCases.length} most recent — all of them files you can open`
              : 'Files you can open'
          }
        >
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
