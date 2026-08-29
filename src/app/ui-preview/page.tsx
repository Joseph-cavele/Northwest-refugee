'use client';

/*
 * TEMPORARY — delete this route.
 *
 * A no-auth, no-database mount of the overview components against fixtures, so the redesign
 * can be looked at rather than reasoned about. Not linked from anywhere.
 */

import { CalendarDays, FolderOpen, GraduationCap, HandCoins } from 'lucide-react';
import type { DashboardCard, MetricRow } from '@/api/reports.api';
import type { CaseRow } from '@/api/cases.api';
import { HeroCard } from '@/features/overview/components/HeroCard';
import { KpiCard } from '@/features/overview/components/KpiCard';
import { StatTile } from '@/features/overview/components/StatTile';
import { AlertsStrip } from '@/features/overview/components/AlertsStrip';
import { RatioGauge } from '@/features/overview/components/RatioGauge';
import { PillarBars } from '@/features/overview/components/PillarBars';
import { SeriesChart } from '@/features/overview/components/SeriesChart';
import { UrgentQueue } from '@/features/overview/components/UrgentQueue';
import { RecentCases } from '@/features/overview/components/RecentCases';
import { OverviewSkeleton } from '@/features/overview/components/OverviewSkeleton';

function SectionHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4">
      <h2 className="shrink-0 text-xs font-bold tracking-[0.16em] text-subtle uppercase">
        {label}
      </h2>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
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
    <section
      className={`flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-shadow duration-200 hover:shadow-lift motion-reduce:transition-none ${className ?? ''}`}
    >
      <header className="border-b border-line bg-gradient-to-b from-ink-25 to-surface px-5 py-4">
        <h3 className="text-base font-semibold tracking-[-0.01em] text-body">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-subtle">{subtitle}</p>}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

const card = (
  key: string,
  label: string,
  value: number,
  period: DashboardCard['period'] = 'CURRENT',
  unit: DashboardCard['unit'] = 'COUNT'
): DashboardCard => ({
  key,
  label,
  value,
  unit,
  group: 'register',
  period,
  scoped: false,
});

/** A wobbling but rising 90-day series, so the sparklines and charts have real shape. */
function makeSeries(key: string, base: number, drift: number): MetricRow[] {
  return Array.from({ length: 90 }, (_, i) => {
    const date = new Date(2026, 4, 22 + i).toISOString().slice(0, 10);
    const wobble = Math.sin(i / 4) * base * 0.18 + Math.sin(i / 11) * base * 0.1;
    return {
      _id: `${key}-${i}`,
      date,
      key,
      dimension: null,
      dimensionValue: null,
      value: Math.max(0, Math.round(base + drift * i + wobble)),
      unit: 'COUNT' as const,
      kind: 'STOCK' as const,
    };
  });
}

const series: MetricRow[] = [
  ...makeSeries('service_requests.overdue', 14, 0.05),
  ...makeSeries('cases.escalated', 6, -0.02),
  ...makeSeries('beneficiaries.registered', 4, 0.03),
  ...makeSeries('cases.closed', 3, 0.04),
  ...makeSeries('cases.open', 38, 0.12),
  ...makeSeries('service_requests.open', 52, 0.08),
];

const caseRow = (
  n: number,
  first: string,
  last: string,
  category: CaseRow['category'],
  ageDays: number,
  priority: CaseRow['priority'],
  status: CaseRow['status'],
  worker: string | null
): CaseRow => ({
  _id: `case-${n}`,
  caseNumber: `NWHR-C-2026-${String(1000 + n)}`,
  beneficiary: {
    _id: `b-${n}`,
    referenceCode: `NWHR-B-${String(4200 + n)}`,
    firstName: first,
    lastName: last,
    status: 'ACTIVE',
  },
  caseworker: worker ? { _id: `u-${n}`, name: worker, role: 'PROJECT_COORDINATOR' } : null,
  category,
  priority,
  status,
  summary: 'Fixture',
  openedAt: new Date(Date.now() - ageDays * 86400000).toISOString(),
  ageDays,
  isEscalated: priority === 'URGENT' || priority === 'HIGH',
});

const urgent: CaseRow[] = [
  caseRow(1, 'Amina', 'Nkurunziza', 'LEGAL_DOCUMENTATION', 31, 'URGENT', 'OPEN', 'T. Mokoena'),
  caseRow(2, 'Joseph', 'Kabila', 'CHILD_PROTECTION', 24, 'URGENT', 'OPEN', 'N. Dlamini'),
  caseRow(3, 'Grace', 'Mutombo', 'GBV_SUPPORT', 17, 'HIGH', 'OPEN', 'T. Mokoena'),
  caseRow(4, 'Samuel', 'Okonkwo', 'SHELTER', 9, 'HIGH', 'OPEN', null),
  caseRow(5, 'Fatima', 'Hassan', 'HEALTHCARE', 4, 'HIGH', 'OPEN', 'N. Dlamini'),
];

const recent: CaseRow[] = [
  caseRow(6, 'Esperance', 'Uwimana', 'FOOD_ASSISTANCE', 0, 'NORMAL', 'OPEN', 'T. Mokoena'),
  caseRow(7, 'Pierre', 'Ndayishimiye', 'EDUCATION_PLACEMENT', 2, 'LOW', 'OPEN', null),
  caseRow(8, 'Miriam', 'Tesfaye', 'PSYCHOSOCIAL', 3, 'HIGH', 'ON_HOLD', 'N. Dlamini'),
  caseRow(9, 'David', 'Chikwanda', 'SKILLS_TRAINING', 5, 'NORMAL', 'OPEN', 'T. Mokoena'),
  caseRow(10, 'Ruth', 'Banda', 'FAMILY_REUNIFICATION', 6, 'NORMAL', 'OPEN', 'M. van Wyk'),
];

const points = (key: string) =>
  series.filter((r) => r.key === key).map((r) => ({ date: r.date, value: r.value }));

export default function UiPreview() {
  return (
    <div className="min-h-screen bg-canvas px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-content flex-col gap-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <HeroCard
            className="lg:col-span-2"
            name="Thandiwe Mokoena"
            role="EXECUTIVE_DIRECTOR"
            headline={card('beneficiaries.active', 'People on the register', 1284)}
            supporting={card('beneficiaries.registered', 'newly registered', 63, 'MONTH_TO_DATE')}
            generatedAt={new Date().toISOString()}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <KpiCard
              card={card('service_requests.overdue', 'Overdue service requests', 18)}
              series={series}
            />
            <KpiCard card={card('cases.escalated', 'Escalated cases', 5)} series={series} />
          </div>
        </div>

        <AlertsStrip
          alerts={[
            {
              id: 'a1',
              severity: 'serious',
              message: '18 service requests are past their standard.',
              action: 'Open the service request queue and reassign the oldest.',
            },
            {
              id: 'a2',
              severity: 'warning',
              message: '5 cases are escalated and still open.',
              action: 'Review the escalated queue with the coordinators.',
            },
          ]}
        />

        <section className="flex flex-col gap-5">
          <SectionHeading label="At a glance" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile card={card('cases.open', 'Open cases', 47)} icon={FolderOpen} tone="brand" />
            <StatTile
              card={card('enrollments.active', 'Active enrolments', 212)}
              icon={GraduationCap}
              tone="gold"
            />
            <StatTile
              card={card('events.upcoming', 'Upcoming events', 4)}
              icon={CalendarDays}
              tone="accent"
            />
            <StatTile
              card={card('donations.settled_value', 'Donations settled', 48650000, 'MONTH_TO_DATE', 'CENTS')}
              icon={HandCoins}
              tone="brand"
            />
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <SectionHeading label="Service demand" />
          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
            <Panel title="How much is late" subtitle="Open service requests past their standard">
              <div className="p-5">
                <RatioGauge
                  value={18}
                  total={52}
                  label="past due"
                  caption="18 of 52 open requests are past the service standard for their urgency."
                  highIsBad
                />
              </div>
            </Panel>
            <Panel title="Where the work sits" subtitle="Open service requests by pillar">
              <div className="p-5">
                <PillarBars
                  counts={{
                    ADVOCACY_DOCUMENTATION: 21,
                    SKILLS_ENTREPRENEURSHIP: 9,
                    EDUCATION: 12,
                    SOCIAL_COHESION: 4,
                    WOMEN_YOUTH_EMPOWERMENT: 6,
                  }}
                />
              </div>
            </Panel>
            <Panel
              className="xl:col-span-2"
              title="Intake and completion"
              subtitle="People registered against cases closed, by week"
            >
              <div className="p-4">
                <SeriesChart
                  variant="bars"
                  unit="COUNT"
                  series={[
                    {
                      key: 'registered',
                      label: 'Registered',
                      points: points('beneficiaries.registered').filter((_, i) => i % 7 === 0),
                    },
                    {
                      key: 'closed',
                      label: 'Cases closed',
                      points: points('cases.closed').filter((_, i) => i % 7 === 0),
                    },
                  ]}
                />
              </div>
            </Panel>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <SectionHeading label="Casework" />
          <div className="grid gap-5 lg:grid-cols-3">
            <Panel
              className="lg:col-span-2"
              title="Live workload"
              subtitle="What is open right now — levels, so the lines are never summed"
            >
              <div className="p-4">
                <SeriesChart
                  variant="line"
                  unit="COUNT"
                  series={[
                    { key: 'cases', label: 'Open cases', points: points('cases.open') },
                    {
                      key: 'requests',
                      label: 'Open requests',
                      points: points('service_requests.open'),
                    },
                  ]}
                />
              </div>
            </Panel>
            <Panel title="Needs a person today" subtitle="Escalated and still open, longest first">
              <UrgentQueue cases={urgent} />
            </Panel>
          </div>

          <Panel
            title="Recently opened cases"
            subtitle="5 most recent — all of them files you can open"
          >
            <RecentCases cases={recent} />
          </Panel>
        </section>

        <section className="flex flex-col gap-5">
          <SectionHeading label="Loading state" />
          <OverviewSkeleton />
        </section>
      </div>
    </div>
  );
}
