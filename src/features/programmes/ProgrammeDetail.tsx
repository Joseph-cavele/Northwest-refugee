'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CalendarRange, MapPin, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  COHORT_STATUS_LABELS,
  PROGRAMME_STATUS_LABELS,
  coordinatorsOf,
  facilitatorOf,
  getProgramme,
  listCohorts,
} from '@/api/programmes.api';
import type { Cohort, CohortStatus } from '@/api/programmes.api';
import { describeSeats } from './lib/seats';
import { PILLAR_LABELS } from '@/types/enums';
import type { Id } from '@/types/models';
import { formatDate } from '@/lib/dates';

/*
 * One programme and the runs of it.
 *
 * A programme on its own is a name and a pillar. The thing anyone actually came here to
 * find out is about a COHORT: when it runs, who leads it, and whether there is room — so
 * the cohorts are the body of this page and the programme is its heading.
 *
 * SEATS ARE THE SIGNATURE, and the rule they carry is in lib/seats.ts: an open door and a
 * free seat are different facts. A cohort that is RUNNING or COMPLETED can have twelve
 * empty places and still take nobody, so the bar below never says "12 left" unless the
 * cohort is genuinely enrollable.
 */

const COHORT_TONE: Record<CohortStatus, string> = {
  PLANNED: 'bg-ink-100 text-ink-600',
  OPEN: 'bg-success-50 text-success-700',
  RUNNING: 'bg-brand-50 text-brand-700',
  COMPLETED: 'bg-ink-100 text-ink-600',
  CANCELLED: 'bg-danger-50 text-danger-700',
};

/** Occupancy, in words first and a track second. */
function Seats({ cohort }: { cohort: Cohort }) {
  const seats = describeSeats({
    taken: cohort.enrolledCount,
    capacity: cohort.capacity,
    enrollable: cohort.isEnrollable,
  });

  const { label, tone, fill } = (() => {
    switch (seats.kind) {
      case 'OVERSUBSCRIBED':
        return {
          label: `${seats.taken} enrolled — ${seats.over} over capacity`,
          tone: 'text-danger-700 font-semibold',
          fill: 'bg-danger-500',
        };
      case 'FULL':
        return {
          label: `Full — ${seats.taken} of ${seats.capacity}`,
          tone: 'text-accent-800 font-semibold',
          fill: 'bg-accent-500',
        };
      case 'OPEN':
        return {
          label: `${seats.remaining} ${seats.remaining === 1 ? 'seat' : 'seats'} left — ${seats.taken} of ${seats.capacity}`,
          tone: 'text-success-700 font-semibold',
          fill: 'bg-success-500',
        };
      case 'CLOSED':
        // No seat count offered: this cohort is not taking anyone, and saying how many
        // places are empty would read as an invitation.
        return {
          label: `${seats.taken} of ${seats.capacity} enrolled · closed to enrolment`,
          tone: 'text-muted',
          fill: 'bg-ink-300',
        };
      case 'NO_CAPACITY':
        return {
          label: `${seats.taken} enrolled — no capacity set`,
          tone: 'text-subtle',
          fill: 'bg-ink-300',
        };
    }
  })();

  return (
    <div className="min-w-0">
      <p className={cn('text-sm', tone)}>
        {seats.kind === 'OVERSUBSCRIBED' && (
          <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
        )}
        {label}
      </p>
      {seats.ratio !== null && (
        // Reinforcement only — the sentence above already carries the whole fact.
        <div className="mt-1.5 h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-ink-200" aria-hidden="true">
          <div className={cn('h-full rounded-full', fill)} style={{ width: `${seats.ratio * 100}%` }} />
        </div>
      )}
    </div>
  );
}

function CohortRow({ cohort }: { cohort: Cohort }) {
  const facilitator = facilitatorOf(cohort);

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-medium text-body">{cohort.name}</h3>
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap',
              COHORT_TONE[cohort.status]
            )}
          >
            {COHORT_STATUS_LABELS[cohort.status]}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-subtle">
          <span className="flex items-center gap-1.5">
            <CalendarRange className="size-3.5" aria-hidden="true" />
            {formatDate(cohort.startDate)} to {formatDate(cohort.endDate)}
            {cohort.durationDays !== null && ` · ${cohort.durationDays} days`}
          </span>
          {cohort.venue && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" aria-hidden="true" />
              {cohort.venue}
            </span>
          )}
          {facilitator && (
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5" aria-hidden="true" />
              {facilitator.name}
            </span>
          )}
        </div>

        {cohort.status === 'CANCELLED' && cohort.cancellationReason && (
          <p className="mt-1.5 text-sm text-danger-700">
            Cancelled — {cohort.cancellationReason}
          </p>
        )}
      </div>

      <div className="shrink-0 sm:w-64 sm:text-right">
        <Seats cohort={cohort} />
      </div>
    </li>
  );
}

export function ProgrammeDetail({ id }: { id: Id }) {
  const [enrollableOnly, setEnrollableOnly] = useState(false);

  const programmeCall = useApi(
    useCallback((signal: AbortSignal) => getProgramme(id, signal), [id]),
    [id]
  );

  const cohortCall = useApi(
    useCallback(
      (signal: AbortSignal) =>
        listCohorts(id, { limit: 50, sort: '-startDate', ...(enrollableOnly ? { enrollableOnly: true } : {}) }, signal),
      [id, enrollableOnly]
    ),
    [id, enrollableOnly]
  );

  if (programmeCall.loading) return <Spinner label="Loading the programme" className="py-24" />;

  if (programmeCall.error) {
    return (
      <div className="flex flex-col items-start gap-4">
        <BackLink />
        <ErrorAlert error={programmeCall.error}>
          {programmeCall.error.code === 'NOT_FOUND' &&
            // 404 covers both "no such programme" and "not one of yours" — coordinators are
            // scoped to the programmes they are named on.
            'Either no programme has that id, or it is outside the programmes your role covers.'}
        </ErrorAlert>
        <Button variant="subtle" onClick={programmeCall.reload}>
          Try again
        </Button>
      </div>
    );
  }

  const programme = programmeCall.data;
  if (!programme) return null;

  const coordinators = coordinatorsOf(programme);
  const cohorts = cohortCall.data?.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <BackLink />

      <header>
        <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
          {PILLAR_LABELS[programme.pillar]}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">{programme.name}</h1>
          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-sm font-semibold text-ink-600">
            {PROGRAMME_STATUS_LABELS[programme.status]}
          </span>
        </div>
        {programme.description && (
          <p className="mt-2 max-w-prose text-base text-muted">{programme.description}</p>
        )}
        <p className="mt-2 text-sm text-subtle">
          {programme.startDate || programme.endDate
            ? `Runs ${formatDate(programme.startDate)} to ${formatDate(programme.endDate)} · `
            : ''}
          {coordinators.length === 0
            ? 'No coordinator assigned'
            : `Coordinated by ${coordinators.map((c) => c.name).join(', ')}`}
        </p>
      </header>

      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-body">
            Cohorts
            {cohortCall.data && (
              <span className="ml-2 font-normal text-subtle">({cohortCall.data.meta.total})</span>
            )}
          </h2>
          <button
            type="button"
            aria-pressed={enrollableOnly}
            onClick={() => setEnrollableOnly((v) => !v)}
            className={cn(
              'min-h-9 rounded-full border px-3.5 text-sm font-semibold transition-colors',
              enrollableOnly
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-line bg-surface text-body hover:border-line-strong'
            )}
          >
            Taking enrolments
          </button>
        </div>

        {cohortCall.error && (
          <div className="mt-3">
            <ErrorAlert error={cohortCall.error} />
          </div>
        )}

        {cohortCall.loading && !cohortCall.data && (
          <Spinner label="Loading cohorts" className="py-8" />
        )}

        {cohortCall.data && cohorts.length === 0 && (
          <p className="mt-3 text-base text-muted">
            {enrollableOnly
              ? 'No cohort is taking enrolments right now.'
              : 'No cohorts have been scheduled for this programme yet.'}
          </p>
        )}

        {cohorts.length > 0 && (
          <ul className="mt-1 divide-y divide-line">
            {cohorts.map((cohort) => (
              <CohortRow key={cohort._id} cohort={cohort} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/programmes"
      className="inline-flex w-fit items-center gap-1.5 text-base text-muted underline-offset-2 hover:text-brand-600 hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to programmes
    </Link>
  );
}

export default ProgrammeDetail;
