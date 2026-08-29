'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, FolderOpen, GraduationCap, HandCoins, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import { OverviewSkeleton } from './components/OverviewSkeleton';
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

/*
 * Every organisation-wide series this screen draws, fetched as one query.
 *
 * THE ORDER IS NOT MEANINGFUL — each chart pulls its own keys out by name.
 */
const SERIES_KEYS = [
  ...EMPHASIS_KEYS,
  'beneficiaries.registered',
  'cases.closed',
  'cases.open',
  'service_requests.open',
  /*
   * The two the snapshot has been writing since day one and nothing has ever drawn.
   *
   * `permits.expiring_30d` is the closest thing this organisation has to a clock: it is the
   * queue the expiry job messages every night, and a permit that lapses is somebody's right
   * to be in the country lapsing. A dashboard for NWHR that plots case volume and not this
   * is measuring its own workload instead of the thing the work is about.
   */
  'permits.expiring_30d',
  'beneficiaries.pending_verification',
];

/*
 * THE WINDOW IS THE FIX, AND IT IS A CORRECTNESS FIX BEFORE IT IS A SPEED ONE.
 *
 * These queries used to pass no date bound at all, so they asked for every metric row ever
 * written and then took `limit: 100` off the top. `listMetrics` sorts by date ASCENDING and
 * applies the limit to the whole result set, not per key — so once the stored series grew
 * past the cap, the hundred rows that came back were the OLDEST hundred and the newest days
 * were silently dropped. No error, no empty state: the charts simply stop moving, and
 * `slice(-windowDays)` in lib/series.ts then reads "the last 30 days" off a series whose
 * last day is months old.
 *
 * The arithmetic is not hypothetical. Two keys at one row per day crossed 100 rows after
 * fifty-one days of operation; the pillar breakdown, at five rows per day, crossed it after
 * twenty — which means it is already truncated against the 46 days `seed:demo` writes, and
 * the "current level" that PillarBars shows is a reading from about three weeks earlier.
 *
 * Bounding the query fixes both problems at once. The server stops returning rows nothing
 * plots, and the limits below are then large enough that nothing is ever cut.
 *
 * THE LIMITS BELOW ONLY BECAME LEGAL WHEN THE SERVER ALLOWED THEM. Both were set to 1000
 * against a cap of 100, and zod's `.max()` REFUSES rather than trims — so the query 400'd,
 * `series` stayed undefined, and every chart on this screen drew its empty state instead.
 * The metrics route and `paginateQuery` now carry their own ceiling for this one
 * non-personal collection; see PAGINATION.METRIC_MAX_LIMIT. Raising these past that ceiling
 * breaks the charts again, silently.
 */
const WINDOW_DAYS = 90;

/** Eight keys, one row per day, plus generous headroom. */
const SERIES_LIMIT = 1000;

/** One key across five pillars, one row per day each, plus the same headroom. */
const PILLAR_LIMIT = 1000;

/*
 * How many recently opened cases the panel lists.
 *
 * Three, not eight. An overview says what is newest; it is not a second copy of the
 * caseload, and the case list one click away holds all of it with filters and a pager. The
 * long version was also the tallest thing on the page by some distance, which put the
 * figures it was meant to support off the bottom of a laptop screen.
 */
const RECENT_CASES = 3;

/** The secondary figures, and the logo figure each borrows for its chip. */
const TILES: { key: string; icon: LucideIcon; tone: 'brand' | 'accent' | 'gold' | 'danger' }[] = [
  { key: 'cases.open', icon: FolderOpen, tone: 'brand' },
  { key: 'enrollments.active', icon: GraduationCap, tone: 'gold' },
  { key: 'events.upcoming', icon: CalendarDays, tone: 'accent' },
  { key: 'donations.settled_value', icon: HandCoins, tone: 'brand' },
];

/*
 * A crossbar of the sheet's ruling, with the section's name written into it.
 *
 * WHY THE PAGE NEEDED THESE. It was six stacked bands of white cards with nothing between
 * them, so a reader scrolling had no way to tell where one idea ended and the next began —
 * the four stat tiles and the four panels below them read as one undifferentiated grid.
 *
 * THE LABELS CARRY NO TIMEFRAME, and that is a deliberate omission rather than a gap. A
 * heading reading "This month" over the tile row would be a claim about four figures that do
 * not share a period — three are current levels and one is month-to-date — and a timeframe
 * quietly attached to figures that do not have it is the same class of mistake as inventing
 * a delta, only harder to notice. Each panel states its own period in its subtitle, where it
 * is true.
 */
function SectionHeading({ label }: { label: string }) {
  return (
    /*
     * The label sits INSIDE the ruling rather than in front of it — a stub of line runs out
     * to the sheet's left edge, the label interrupts it, and the rest carries on to the
     * right edge. That is how a heading is written into a ruled register, and it is the
     * difference between a page that has an architecture and one that has captions.
     *
     * The negative margin is what reaches the frame: the sheet insets its content by 6, so
     * -6 puts both ends of the rule exactly on the hairlines. Below `sm` there are no
     * hairlines to reach and the inset is zero, so the bleed is switched off with them.
     */
    <div className="flex items-center gap-3 sm:-mx-6">
      <span className="hidden h-px w-6 shrink-0 bg-line sm:block" aria-hidden="true" />
      <h2 className="shrink-0 text-xs font-bold tracking-[0.16em] text-subtle uppercase">
        {label}
      </h2>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      <span className="hidden h-px w-6 shrink-0 bg-line sm:block" aria-hidden="true" />
    </div>
  );
}

/**
 * The ruled sheet the whole screen sits on.
 *
 * The edges are absolutely positioned rather than a `border-x`, because a border cannot be
 * masked — and the fade at top and bottom is the point of them. See `.frame-edge`.
 */
function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative sm:px-6">
      <span className="frame-edge absolute inset-y-0 left-0 hidden w-px sm:block" aria-hidden="true" />
      <span
        className="frame-edge absolute inset-y-0 right-0 hidden w-px sm:block"
        aria-hidden="true"
      />
      {/* A little more air between bands than before: the rules now do the separating that
          eight drop shadows were doing, and a rule needs space either side to read as one. */}
      <div className="flex flex-col gap-7">{children}</div>
    </div>
  );
}

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
    /*
     * NO SHADOW, AND NO LIFT ON HOVER. Both went with the redesign, for two reasons.
     *
     * The ruling now carries the structure these panels were using elevation to imply, and
     * eight lifted white boxes inside a frame is the frame arguing with its own contents.
     * The hero is the one raised object on the screen, which is what makes it read as the
     * headline rather than as another card.
     *
     * The lift was also a false affordance: a panel is not clickable, and a surface that
     * responds to a cursor is telling the reader it will do something when they press it.
     */
    <section
      className={`flex flex-col overflow-hidden rounded-2xl border border-line bg-surface ${className ?? ''}`}
    >
      {/*
        * The header sits on a faint wash that fades into the body. It reads as a label
        * attached to the panel rather than as a first row of content — which a plain white
        * band above a plain white body did not, however heavy the type was.
        *
        * h3, not h2: SectionHeading above owns the h2 level, so a panel inside a section is
        * one step down. Screen-reader users navigate this page by heading.
        */}
      <header className="border-b border-line bg-gradient-to-b from-ink-25 to-surface px-5 py-4">
        <h3 className="text-base font-semibold tracking-[-0.01em] text-body">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-subtle">{subtitle}</p>}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

/** Shown wherever a chart has no history yet. Says what would fill it, not just that it is empty. */
function AwaitingSnapshot({ failed = false }: { failed?: boolean }) {
  /*
   * "NO HISTORY YET" AND "THE REQUEST FAILED" ARE DIFFERENT FACTS AND MUST NOT LOOK ALIKE.
   *
   * This panel told the first story while the second was true, and it did it for as long as
   * the series query was being rejected for asking past the row cap — every chart on the
   * screen quietly reading as a young installation with nothing recorded yet, while the
   * snapshot job wrote its rows every night. Nobody goes looking for a bug behind a
   * reassuring empty state.
   */
  if (failed) {
    return (
      <div className="max-w-xs text-center">
        <p className="text-base text-body">The figures could not be loaded.</p>
        <p className="mt-1 text-sm text-muted">
          This is not an empty chart — the request for the series failed. Reload, and report
          it if it keeps happening.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-xs text-center">
      <p className="text-base text-muted">No history yet.</p>
      <p className="mt-1 text-sm text-subtle">
        The daily snapshot writes one row per day. Charts fill in from the first run.
      </p>
    </div>
  );
}

export default function Overview() {
  const { user, can } = useAuth();

  /*
   * One instant for the whole screen, fixed on mount rather than read during render — so
   * every chart's "last reading N days ago" is measured from the same moment and the render
   * stays a pure function of its inputs. The register's list does the same, for the same
   * reason.
   */
  const [now] = useState(() => Date.now());

  const mayReadMetrics = can(PERMISSIONS.METRIC_READ);
  const mayReadCases = can(PERMISSIONS.CASE_READ);

  /*
   * The only action on an otherwise read-only screen, and it is here rather than on the
   * register alone because this is where everybody lands: an officer at the front desk with
   * somebody in front of them should not have to find the register first.
   *
   * ABSENT, NOT DISABLED, WHERE THE PERMISSION IS NOT HELD — beneficiary:create belongs to
   * the roles that meet people, and the Executive Director is deliberately not among them.
   * A greyed button on the director's dashboard would advertise a route that does not exist
   * for them. The server refuses the POST regardless; this only decides what to render.
   */
  const mayRegister = can(PERMISSIONS.BENEFICIARY_CREATE);

  /*
   * Computed once per mount, not per render: it is a dependency of both metric fetches, and
   * a fresh `new Date()` on every render would be a new string every time, which would make
   * the callbacks new every time and refetch the whole screen in a loop.
   *
   * Date-only, so it is stable for the whole day and two people signing in an hour apart
   * request the same window — which is also what makes it cacheable later.
   */
  const windowStart = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - WINDOW_DAYS);
    return start.toISOString().slice(0, 10);
  }, []);

  const { data: cards, loading, error, reload } = useApi(
    useCallback((signal: AbortSignal) => getDashboardCards(signal), [])
  );

  /*
   * ONE REQUEST FOR EVERY ORGANISATION-WIDE SERIES ON THE SCREEN. These were three calls to
   * the same endpoint differing only in `key`, which is three round trips for one query the
   * server can answer once. The rows come back mixed and `toPoints(rows, key)` splits them
   * per chart, exactly as it did when they arrived separately.
   *
   * The pillar breakdown below stays its own request and has to: `dimension: 'pillar'` is a
   * different shape of row, and the service is explicit that mixing a breakdown into the
   * organisation-wide totals double-counts everything the caller then adds up.
   */
  const { data: series, error: seriesError } = useApi<MetricRow[]>(
    useCallback(
      (signal: AbortSignal) =>
        mayReadMetrics
          ? getMetrics({ key: SERIES_KEYS, from: windowStart, limit: SERIES_LIMIT }, signal)
          : Promise.resolve([]),
      [mayReadMetrics, windowStart]
    ),
    [mayReadMetrics, windowStart]
  );

  /*
   * A failed fetch is not an empty one. `useApi` reports the two separately and the charts
   * below say which happened — see AwaitingSnapshot.
   */
  const seriesFailed = seriesError !== null;

  const { data: pillars } = useApi<MetricRow[]>(
    useCallback(
      (signal: AbortSignal) =>
        mayReadMetrics
          ? getMetrics(
              {
                key: 'service_requests.open',
                dimension: 'pillar',
                from: windowStart,
                limit: PILLAR_LIMIT,
              },
              signal
            )
          : Promise.resolve([]),
      [mayReadMetrics, windowStart]
    ),
    [mayReadMetrics, windowStart]
  );

  // Both case endpoints are paginated; these two panels want the rows, not the totals.
  const { data: recentCases } = useApi(
    useCallback(
      (signal: AbortSignal) =>
        mayReadCases
          ? listCases({ limit: RECENT_CASES, sort: '-openedAt', openOnly: true }, signal).then((p) => p.data)
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
    <Sheet>
      {loading && !cards && (
        <>
          {/*
            * The skeleton is aria-hidden, so this line is what a screen reader hears —
            * once, rather than a description of eleven grey rectangles.
            */}
          <p className="sr-only" role="status">
            Loading your figures
          </p>
          <OverviewSkeleton />
        </>
      )}

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
            action={
              mayRegister ? (
                /*
                 * An anchor, not a button: middle-click and open-in-new-tab both matter at a
                 * desk where an intake is started while a record is already open. The focus
                 * outline is overridden to white — the global one is brand-400, which is
                 * nearly invisible on brand-500, and this is a keyboard-driven screen.
                 */
                <Link
                  href="/dashboard/beneficiaries/new"
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-5 text-base font-semibold text-brand-700 transition-colors hover:bg-ink-50 focus-visible:outline-white"
                >
                  <UserPlus className="size-4" aria-hidden="true" />
                  Register someone
                </Link>
              ) : undefined
            }
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {emphasis.map((card) => (
              <KpiCard key={card.key} card={card} series={series ?? []} />
            ))}
            {emphasis.length === 0 && (
              // Absent rather than zeroed: a role without casework cannot see a caseload,
              // and "0 overdue" would be a claim about one.
              <p className="rounded-2xl border border-line bg-surface p-5 text-base text-muted">
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
        <section className="flex flex-col gap-4">
          <SectionHeading label="At a glance" />
          {/*
            * ONE STRIP, DIVIDED — not four cards with gaps between them.
            *
            * The gaps were saying these figures are four separate things. They are four
            * readings of the same organisation on the same day, which is what a single
            * ruled row says instead. It also removes three of the four vertical borders
            * and all four shadows from the widest band on the page.
            *
            * NO PERIOD IS CLAIMED HERE, deliberately. Three of these are current levels and
            * one is month-to-date, so a timeframe written on the rule above would be a
            * claim about four figures that do not share one. Each tile's own label carries
            * what it measures.
            */}
          {/*
            * The dividers are the grid's own gap: a 1px gap over a `bg-line` container,
            * with each tile painting itself `bg-surface`. One rule for every breakpoint,
            * rather than a column of nth-child overrides that has to be re-reasoned every
            * time the count changes from one to two to four.
            */}
          <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
            {tiles.map((tile) => (
              <StatTile key={tile.key} card={tile.card!} icon={tile.icon} tone={tile.tone} flush />
            ))}
          </div>
        </section>
      )}

      {/*
        * --- the paperwork clock ---
        *
        * Directly under the register's own headline, because it is the same subject: the
        * hero counts who is on the register, and this says whose standing on it is about to
        * change. Both lines mean a person is waiting on a document — one on Home Affairs,
        * one on us — which is what makes them a legitimate pair on a single axis.
        *
        * PLOTTED AS LEVELS AND NEVER SUMMED. Both are STOCKs: "how many permits lapse
        * within thirty days" is a reading taken on a day, not an amount accrued over one,
        * and adding a week of those would report roughly seven times the number of permits
        * that exist. That is why this is a line and the intake chart below is bars.
        */}
      {mayReadMetrics && (
        <section className="flex flex-col gap-5">
          <SectionHeading label="Register standing" />

          <Panel
            title="Permits running out"
            subtitle="Permits lapsing within 30 days, against people still awaiting verification"
          >
            <div className="p-4">
              <SeriesChart
                variant="line"
                unit="COUNT"
                empty={<AwaitingSnapshot failed={seriesFailed} />}
                    now={now}
                series={[
                  {
                    key: 'permits',
                    label: 'Permits lapsing',
                    points: toPoints(series ?? [], 'permits.expiring_30d'),
                  },
                  {
                    key: 'pending',
                    label: 'Awaiting verification',
                    points: toPoints(series ?? [], 'beneficiaries.pending_verification'),
                  },
                ]}
              />
            </div>
          </Panel>
        </section>
      )}

      {/*
        * --- the chart row: a ratio, a ranked list, and the wide chart ---
        *
        * The reference's proportions, roughly 1:1:2, because the same thing is true of the
        * content: two narrow panels that answer "how bad" and "where", and a wide one that
        * answers "which way is it going". The wide chart earns the width — a grouped bar
        * over 46 days is unreadable in a quarter of a row.
        */}
      {(overdueRatio || mayReadMetrics) && (
        <section className="flex flex-col gap-5">
          <SectionHeading label="Service demand" />

          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
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
                    * Summed into weeks, not drawn per day. Forty-six daily slots gave each
                    * bar about three pixels — a texture rather than a comparison.
                    *
                    * The sum is legitimate because BOTH of these are FLOW metrics: an amount
                    * over a period, so a week really is the total of its days. The chart
                    * below it plots levels and is deliberately left daily, because adding
                    * seven days of "open cases" would produce a number seven times larger
                    * than anything that was ever true.
                    */}
                  <SeriesChart
                    variant="bars"
                    unit="COUNT"
                    empty={<AwaitingSnapshot failed={seriesFailed} />}
                    now={now}
                    series={[
                      {
                        key: 'registered',
                        label: 'Registered',
                        points: sumIntoWeeks(toPoints(series ?? [], 'beneficiaries.registered')),
                      },
                      {
                        key: 'closed',
                        label: 'Cases closed',
                        points: sumIntoWeeks(toPoints(series ?? [], 'cases.closed')),
                      },
                    ]}
                  />
                </div>
              </Panel>
            )}
          </div>
        </section>
      )}

      {/* --- the trend, and what needs a person --- */}
      {(mayReadMetrics || mayReadCases) && (
        <section className="flex flex-col gap-5">
          <SectionHeading label="Casework" />

          <div className="grid gap-5 lg:grid-cols-3">
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
                    empty={<AwaitingSnapshot failed={seriesFailed} />}
                    now={now}
                    series={[
                      {
                        key: 'cases',
                        label: 'Open cases',
                        points: toPoints(series ?? [], 'cases.open'),
                      },
                      {
                        key: 'requests',
                        label: 'Open requests',
                        points: toPoints(series ?? [], 'service_requests.open'),
                      },
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
              <Panel
                title="Needs a person today"
                subtitle="Escalated and still open, longest first"
              >
                <UrgentQueue cases={urgent ?? []} />
              </Panel>
            )}
          </div>

          {/* --- the register itself --- */}
          {mayReadCases && (
            <Panel
              title="Recently opened cases"
              /*
               * "you can open" is not filler. These rows are already row-scoped server-side,
               * so a coordinator's list is their programmes and a volunteer's is what they
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
        </section>
      )}

      {cards && cards.cards.length === 0 && (
        /*
         * Reachable: a role can hold report:read and none of the permissions behind any
         * individual card. Saying so beats an empty page that reads as broken — and beats
         * inventing zeros, which would state something untrue.
         */
        <p className="rounded-2xl border border-line bg-surface p-6 text-base text-muted">
          There are no figures your role can see yet. Your work lives in the sections of the
          menu — ask an administrator if you expected something here.
        </p>
      )}
    </Sheet>
  );
}
