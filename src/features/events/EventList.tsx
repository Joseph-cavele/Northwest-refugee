'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, MapPin, Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useDebounce } from '@/hooks/useDebounce';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pager } from '@/components/ui/pager';
import { Spinner } from '@/components/ui/spinner';
import {
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  listEvents,
  organiserOf,
} from '@/api/events.api';
import type { EventRow, EventStatus, EventType, ListEventsQuery } from '@/api/events.api';
import { describeTurnout } from './lib/turnout';
import { PILLAR_LABELS } from '@/types/enums';
import { formatCount } from '@/lib/format';
import { formatDate, formatTime } from '@/lib/dates';

/*
 * The events diary.
 *
 * TURNOUT IS A SIGNED FIGURE, NOT A BAR. Cohort seats have a ceiling, so a filled track is
 * the honest picture there. An event has no ceiling — 300 people at a 200-person dialogue
 * is a real and useful fact — so a track that pins at 100% would hide the most interesting
 * outcome on the screen. The number carries its own sign instead.
 *
 * And an event still ahead is reported as still ahead. `recordedAttendance` is zero until
 * someone works the register, so subtracting it from the plan would mark every future event
 * as a total failure. See lib/turnout.ts.
 */

const PAGE_SIZE = 25;

const STATUS_TONE: Record<EventStatus, string> = {
  PLANNED: 'bg-ink-100 text-ink-600',
  CONFIRMED: 'bg-brand-50 text-brand-700',
  COMPLETED: 'bg-success-50 text-success-700',
  CANCELLED: 'bg-danger-50 text-danger-700',
};

/** Planned against actual, in the words someone writing a report would use. */
function Turnout({ event }: { event: EventRow }) {
  const turnout = describeTurnout({
    recorded: event.recordedAttendance,
    expected: event.expectedAttendance,
    status: event.status,
    isPast: event.isPast,
  });

  switch (turnout.kind) {
    case 'CANCELLED':
      return <span className="text-xs text-subtle">—</span>;
    case 'UPCOMING':
      return (
        <span className="text-xs whitespace-nowrap text-muted">
          {turnout.expected > 0 ? `${formatCount(turnout.expected)} expected` : 'No target set'}
        </span>
      );
    case 'NO_TARGET':
      return (
        <span className="text-xs whitespace-nowrap text-body">
          {formatCount(turnout.recorded)} attended
        </span>
      );
    case 'SHORT':
      return (
        <span className="text-xs whitespace-nowrap">
          <span className="font-semibold text-body">{formatCount(turnout.recorded)}</span>
          <span className="ml-1.5 text-accent-800">{formatCount(turnout.by)} short</span>
        </span>
      );
    case 'MET':
      return (
        <span className="text-xs whitespace-nowrap">
          <span className="font-semibold text-body">{formatCount(turnout.recorded)}</span>
          <span className="ml-1.5 text-success-700">on target</span>
        </span>
      );
    case 'OVER':
      return (
        <span className="text-xs whitespace-nowrap">
          <span className="font-semibold text-body">{formatCount(turnout.recorded)}</span>
          <span className="ml-1.5 text-success-700">+{formatCount(turnout.by)}</span>
        </span>
      );
  }
}

export function EventList() {
  const [term, setTerm] = useState('');
  const [type, setType] = useState<EventType | ''>('');
  const [status, setStatus] = useState<EventStatus | ''>('');
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [page, setPage] = useState(1);

  const search = useDebounce(term.trim(), 300);

  const { data, loading, error, reload } = useApi(
    useCallback(
      (signal: AbortSignal) => {
        const query: ListEventsQuery = {
          page,
          limit: PAGE_SIZE,
          // Newest first in the archive; the diary flips to soonest first, because an
          // upcoming list read backwards from next year is useless.
          sort: upcomingOnly ? 'startsAt' : '-startsAt',
          ...(search ? { search } : {}),
          ...(type ? { type } : {}),
          ...(status ? { status } : {}),
          ...(upcomingOnly ? { upcomingOnly: true } : {}),
        };
        return listEvents(query, signal);
      },
      [page, search, type, status, upcomingOnly]
    ),
    [page, search, type, status, upcomingOnly]
  );

  function refilter(change: () => void) {
    change();
    setPage(1);
  }

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const filtered = Boolean(search || type || status || upcomingOnly);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Events</h1>
        <p className="mt-1 text-sm text-muted">
          {meta
            ? `${formatCount(meta.total)} ${meta.total === 1 ? 'event' : 'events'}`
            : 'Awareness days, outreach, dialogues and commemorations.'}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Search events by title</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
            aria-hidden="true"
          />
          <input
            type="search"
            value={term}
            onChange={(event) => refilter(() => setTerm(event.target.value))}
            placeholder="Search by title"
            className="min-h-10 w-full rounded-full border border-line bg-surface pr-4 pl-9 text-sm text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400"
          />
        </label>

        <button
          type="button"
          aria-pressed={upcomingOnly}
          onClick={() => refilter(() => setUpcomingOnly((v) => !v))}
          className={cn(
            'inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
            upcomingOnly
              ? 'border-brand-500 bg-brand-500 text-white'
              : 'border-line bg-surface text-body hover:border-line-strong'
          )}
        >
          <CalendarDays className="size-4" aria-hidden="true" />
          Coming up
        </button>

        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Filter by type</span>
          <select
            value={type}
            onChange={(event) => refilter(() => setType(event.target.value as EventType | ''))}
            className="min-h-10 rounded-full border border-line bg-surface px-4 text-sm text-body hover:border-line-strong"
          >
            <option value="">Every type</option>
            {EVENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {EVENT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Filter by status</span>
          <select
            value={status}
            onChange={(event) => refilter(() => setStatus(event.target.value as EventStatus | ''))}
            // "Coming up" already means planned or confirmed; offering "Completed" beside
            // it would guarantee an empty list and look like a broken filter.
            disabled={upcomingOnly}
            className="min-h-10 rounded-full border border-line bg-surface px-4 text-sm text-body hover:border-line-strong disabled:text-ink-400"
          >
            <option value="">Every status</option>
            {EVENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {EVENT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="flex flex-col items-start gap-3">
          <ErrorAlert error={error} />
          <Button variant="subtle" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {loading && !data && <Spinner label="Loading events" className="py-20" />}

      {data && rows.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-sm text-body">
            {upcomingOnly && !search && !type
              ? 'Nothing is scheduled yet.'
              : filtered
                ? 'No events match those filters.'
                : 'No events have been recorded yet.'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            Attendance at a community event is counted by gender and age band — a register
            here never asks for names.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const organiser = organiserOf(row);
            return (
              <li
                key={row._id}
                className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-body">
                        <Link
                          href={`/dashboard/events/${row._id}`}
                          className="underline-offset-2 hover:text-brand-600 hover:underline"
                        >
                          {row.title}
                        </Link>
                      </h2>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
                          STATUS_TONE[row.status]
                        )}
                      >
                        {EVENT_STATUS_LABELS[row.status]}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-subtle">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" aria-hidden="true" />
                        {formatDate(row.startsAt)} at {formatTime(row.startsAt)}
                      </span>
                      <span>{EVENT_TYPE_LABELS[row.type]}</span>
                      {row.pillar && <span>{PILLAR_LABELS[row.pillar]}</span>}
                      {row.venue && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="size-3.5" aria-hidden="true" />
                          {row.venue}
                        </span>
                      )}
                      {organiser && (
                        <span className="flex items-center gap-1.5">
                          <Users className="size-3.5" aria-hidden="true" />
                          {organiser.name}
                        </span>
                      )}
                    </div>

                    {row.status === 'CANCELLED' && row.cancellationReason && (
                      <p className="mt-1.5 text-xs text-danger-700">
                        Cancelled — {row.cancellationReason}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <Turnout event={row} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {meta && <Pager meta={meta} onPage={setPage} label="Event pages" />}
    </div>
  );
}

export default EventList;
