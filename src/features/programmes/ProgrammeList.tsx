'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Archive, CalendarRange, Plus, Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { useDebounce } from '@/hooks/useDebounce';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  coordinatorsOf,
  listProgrammes,
  PROGRAMME_STATUSES,
  PROGRAMME_STATUS_LABELS,
} from '@/api/programmes.api';
import type { ListProgrammesQuery, Programme, ProgrammeStatus } from '@/api/programmes.api';
import { PILLAR_LABELS, PROGRAMME_PILLARS } from '@/types/enums';
import type { ProgrammePillar } from '@/types/enums';
import { formatDate } from '@/lib/dates';

/*
 * What NWHR runs.
 *
 * NOT A QUEUE, AND SO NOT A TABLE. The other three screens answer "what needs me today" and
 * are read by scanning rows. This one answers "what do we offer, and under which pillar" —
 * a catalogue, read a card at a time, where a programme's description is part of the answer
 * rather than a truncated cell.
 *
 * GROUPED BY PILLAR because the five pillars are the organisation's own account of itself
 * and the axis every report already groups by. That is structure carrying meaning, not
 * decoration — and it is the reason this fetches the whole catalogue in one page rather
 * than paginating: a pillar heading above a slice of one page would be a lie about how many
 * programmes that pillar has. An NGO runs tens of programmes, not thousands, and the server
 * caps a page at 100; the note below covers the day that stops being true.
 *
 * NO COLOUR PER PILLAR. Five arbitrary hues would be five things to learn, none of them
 * meaning anything, and on this palette two of them would fail contrast. The pillar is
 * written down instead.
 */

// The server's own ceiling. Asking for more is refused, so this is the honest maximum.
const CATALOGUE_LIMIT = 100;

const STATUS_TONE: Record<ProgrammeStatus, string> = {
  PLANNED: 'bg-ink-100 text-ink-600',
  ACTIVE: 'bg-success-50 text-success-700',
  PAUSED: 'bg-accent-50 text-accent-800',
  COMPLETED: 'bg-brand-50 text-brand-700',
  ARCHIVED: 'bg-ink-100 text-ink-600',
};

function Card({ programme }: { programme: Programme }) {
  const coordinators = coordinatorsOf(programme);

  return (
    <li className="flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-base font-semibold text-body">
          <Link
            href={`/dashboard/programmes/${programme._id}`}
            className="underline-offset-2 hover:text-brand-600 hover:underline"
          >
            {programme.name}
          </Link>
        </h3>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap',
            STATUS_TONE[programme.status]
          )}
        >
          {PROGRAMME_STATUS_LABELS[programme.status]}
        </span>
      </div>

      {programme.description && (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">
          {programme.description}
        </p>
      )}

      <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-subtle">
        {(programme.startDate || programme.endDate) && (
          <div className="flex items-center gap-1.5">
            <CalendarRange className="size-3.5" aria-hidden="true" />
            <dt className="sr-only">Runs</dt>
            <dd>
              {programme.startDate ? formatDate(programme.startDate) : '—'}
              {programme.endDate ? ` to ${formatDate(programme.endDate)}` : ''}
            </dd>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden="true" />
          <dt className="sr-only">Coordinators</dt>
          {/*
            * Named, not counted, where there is room: a coordinator on this list is scoped
            * to the whole programme's caseload, so who they are is an access fact worth
            * reading rather than a number.
            */}
          <dd className="truncate">
            {coordinators.length === 0
              ? 'No coordinator'
              : coordinators.map((c) => c.name).join(', ')}
          </dd>
        </div>
        {programme.isArchived && (
          <div className="flex items-center gap-1.5 text-ink-500">
            <Archive className="size-3.5" aria-hidden="true" />
            <dt className="sr-only">Archived</dt>
            <dd>Archived {formatDate(programme.archivedAt)}</dd>
          </div>
        )}
      </dl>
    </li>
  );
}

export function ProgrammeList() {
  const { can } = useAuth();
  const [term, setTerm] = useState('');
  const [pillar, setPillar] = useState<ProgrammePillar | ''>('');
  const [status, setStatus] = useState<ProgrammeStatus | ''>('');
  const [includeArchived, setIncludeArchived] = useState(false);

  // A substring match server-side, so unlike the register two letters genuinely narrow it.
  const search = useDebounce(term.trim(), 300);

  const { data, loading, error, reload } = useApi(
    useCallback(
      (signal: AbortSignal) => {
        const query: ListProgrammesQuery = {
          limit: CATALOGUE_LIMIT,
          sort: 'name',
          ...(search ? { search } : {}),
          ...(pillar ? { pillar } : {}),
          ...(status ? { status } : {}),
          ...(includeArchived ? { includeArchived: true } : {}),
        };
        return listProgrammes(query, signal);
      },
      [search, pillar, status, includeArchived]
    ),
    [search, pillar, status, includeArchived]
  );

  const rows = data?.data ?? [];
  const meta = data?.meta;
  // Only the pillars that actually have something, in the organisation's own order.
  const grouped = PROGRAMME_PILLARS.map((key) => ({
    key,
    programmes: rows.filter((p) => p.pillar === key),
  })).filter((group) => group.programmes.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Programmes</h1>
          <p className="mt-1 text-base text-muted">
            {meta
              ? `${meta.total} ${meta.total === 1 ? 'programme' : 'programmes'} across ${grouped.length} ${grouped.length === 1 ? 'pillar' : 'pillars'}`
              : 'What this organisation runs, by pillar.'}
          </p>
        </div>

        {can(PERMISSIONS.PROGRAMME_CREATE) && (
          <Link
            href="/dashboard/programmes/new"
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-brand-500 px-5 text-base font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <Plus className="size-4" aria-hidden="true" />
            New programme
          </Link>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Search programmes by name</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
            aria-hidden="true"
          />
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search by name"
            className="min-h-10 w-full rounded-full border border-line bg-surface pr-4 pl-9 text-base text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400"
          />
        </label>

        <label className="flex items-center gap-2 text-base">
          <span className="sr-only">Filter by pillar</span>
          <select
            value={pillar}
            onChange={(event) => setPillar(event.target.value as ProgrammePillar | '')}
            className="min-h-10 rounded-full border border-line bg-surface px-4 text-base text-body hover:border-line-strong"
          >
            <option value="">Every pillar</option>
            {PROGRAMME_PILLARS.map((value) => (
              <option key={value} value={value}>
                {PILLAR_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-base">
          <span className="sr-only">Filter by status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ProgrammeStatus | '')}
            className="min-h-10 rounded-full border border-line bg-surface px-4 text-base text-body hover:border-line-strong"
          >
            <option value="">Every status</option>
            {PROGRAMME_STATUSES.map((value) => (
              <option key={value} value={value}>
                {PROGRAMME_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-h-10 items-center gap-2 text-base text-body">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
            className="size-4 rounded border-line"
          />
          Include archived
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

      {loading && !data && <Spinner label="Loading programmes" className="py-20" />}

      {data && rows.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-base text-body">
            {search || pillar || status
              ? 'No programmes match those filters.'
              : 'No programmes have been set up yet.'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            {search || pillar || status
              ? 'Archived programmes are hidden unless you include them.'
              : 'A programme belongs to one pillar permanently, because every report groups by it.'}
          </p>
        </div>
      )}

      {grouped.map((group) => (
        <section key={group.key}>
          <h2 className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
            {PILLAR_LABELS[group.key]}
            <span className="ml-2 font-normal tracking-normal normal-case">
              {group.programmes.length}
            </span>
          </h2>
          <ul className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.programmes.map((programme) => (
              <Card key={programme._id} programme={programme} />
            ))}
          </ul>
        </section>
      ))}

      {meta && meta.total > rows.length && (
        // The catalogue outgrew one request. Said plainly rather than silently showing a
        // subset under headings that imply completeness.
        <p className="text-sm text-subtle">
          Showing the first {rows.length} of {meta.total}. Narrow by pillar or status to see
          the rest.
        </p>
      )}
    </div>
  );
}

export default ProgrammeList;
