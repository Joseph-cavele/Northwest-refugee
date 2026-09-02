'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Globe, Search, UserPlus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pager } from '@/components/ui/pager';
import { Spinner } from '@/components/ui/spinner';
import {
  INTAKE_SOURCE_LABELS,
  INTAKE_STATUS_LABELS,
  beneficiaryOf,
  listIntakes,
  programmeOf,
} from '@/api/intakes.api';
import type { IntakeRow, IntakeStatus, ListIntakesQuery } from '@/api/intakes.api';
import { formatCount } from '@/lib/format';
import { formatDate, formatRelative } from '@/lib/dates';

/*
 * The intake queue: everyone who has asked NWHR for something and has not yet been decided
 * about.
 *
 * THIS SCREEN EXISTS BECAUSE AN APPLICANT IS NOT A BENEFICIARY. Before it, a public
 * application wrote a row straight into the register, so the only list of "people who asked"
 * was the register itself — and the register is meant to answer a different question. This
 * is the waiting room; the register is who NWHR works with.
 *
 * ORDERED OLDEST FIRST WITHIN THE OPEN TABS, and that is not the usual choice. A list of
 * applications sorted newest-first buries the person who has been waiting longest under
 * everybody who applied this morning — which is precisely the person a queue exists to
 * surface. "All" keeps newest-first, because there it is a record rather than a queue.
 */

const PAGE_SIZE = 25;

/*
 * The tabs from the brief. Each is a real query rather than a client-side filter over one
 * fetch: a filter that runs in the browser is a filter that lies as soon as there is more
 * than one page of results.
 */
const TABS = [
  { key: 'pending', label: 'Pending screening', query: { status: 'PENDING_SCREENING' as IntakeStatus }, oldestFirst: true },
  { key: 'open', label: 'All open', query: { openOnly: true }, oldestFirst: true },
  { key: 'online', label: 'Online', query: { source: 'ONLINE' as const }, oldestFirst: false },
  { key: 'walkin', label: 'Walk-ins', query: { source: 'WALK_IN' as const }, oldestFirst: false },
  { key: 'all', label: 'All', query: {}, oldestFirst: false },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/*
 * Status colours. Three groups, and the grouping is the message: something is waiting on
 * NWHR, something is settled, or somebody has been taken on.
 */
const STATUS_TONE: Record<IntakeStatus, string> = {
  PENDING_SCREENING: 'bg-accent-50 text-accent-800',
  IN_SCREENING: 'bg-brand-50 text-brand-700',
  MORE_INFO_REQUIRED: 'bg-accent-50 text-accent-800',
  WAITING_LIST: 'bg-gold-50 text-gold-700',
  APPROVED: 'bg-success-50 text-success-700',
  REFERRED: 'bg-ink-100 text-ink-600',
  NOT_ELIGIBLE: 'bg-ink-100 text-ink-600',
  WITHDRAWN: 'bg-ink-100 text-ink-600',
};

function StatusPill({ status }: { status: IntakeStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap',
        STATUS_TONE[status]
      )}
    >
      {INTAKE_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * The applicant, and the way through to their application.
 *
 * The NAME is the link, not the row — a row-sized target swallows text selection, so an
 * officer cannot copy a reference to read down a phone, and it gives a screen reader one
 * enormous unlabelled link per person.
 */
function Applicant({ row }: { row: IntakeRow }) {
  const linked = beneficiaryOf(row);

  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-100 text-sm font-semibold text-ink-600"
      >
        {`${row.firstName[0] ?? ''}${row.lastName[0] ?? ''}`.toUpperCase()}
      </span>
      <div className="min-w-0">
        <Link
          href={`/dashboard/intake/${row._id}`}
          className="block truncate font-medium text-body underline-offset-2 hover:text-brand-600 hover:underline"
        >
          {row.firstName} {row.lastName}
        </Link>
        <span className="block truncate font-mono text-sm text-subtle">{row.reference}</span>
        {linked && (
          /* Already on the register — a returning person applying again, not a new one. */
          <span className="mt-0.5 block truncate text-sm text-success-700">
            On the register as {linked.referenceCode}
          </span>
        )}
      </div>
    </div>
  );
}

const HEADINGS = ['Applicant', 'Source', 'Asking for', 'Received', 'Status'];

export function IntakeQueue() {
  const { can } = useAuth();
  const [tab, setTab] = useState<TabKey>('pending');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);

  const search = useDebounce(term.trim(), 300);
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];

  const { data, loading, error, reload } = useApi(
    useCallback(
      (signal: AbortSignal) => {
        const query: ListIntakesQuery = {
          page,
          limit: PAGE_SIZE,
          ...active.query,
          ...(search.length >= 2 ? { search } : {}),
          // See the note at the top: a queue puts the longest wait first.
          sort: active.oldestFirst ? 'receivedAt' : '-receivedAt',
        };
        return listIntakes(query, signal);
      },
      [page, search, active]
    ),
    [page, search, tab]
  );

  function choose(next: TabKey) {
    setTab(next);
    // Page 7 of a different tab is empty.
    setPage(1);
  }

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Intake</h1>
          <p className="mt-1 max-w-prose text-base text-muted">
            People who have asked for help and have not been screened yet. Nobody here is on
            the register — approving a screening is what puts them there.
          </p>
        </div>

        {can(PERMISSIONS.INTAKE_CREATE) && (
          <Link
            href="/dashboard/intake/new"
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-brand-500 px-5 text-base font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <UserPlus className="size-4" aria-hidden="true" />
            New walk-in intake
          </Link>
        )}
      </header>

      {/* --- the tabs --------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => choose(option.key)}
            aria-current={option.key === tab ? 'true' : undefined}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors',
              option.key === tab
                ? 'bg-ink-950 text-white'
                : 'border border-line bg-surface text-muted hover:border-line-strong hover:text-body'
            )}
          >
            {option.key === 'online' && <Globe className="size-3.5" aria-hidden="true" />}
            {option.key === 'walkin' && <Users className="size-3.5" aria-hidden="true" />}
            {option.key === 'pending' && <ClipboardList className="size-3.5" aria-hidden="true" />}
            {option.label}
          </button>
        ))}
      </div>

      <label className="relative min-w-0 sm:max-w-sm">
        <span className="sr-only">Search by name or reference</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
          aria-hidden="true"
        />
        <input
          type="search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setPage(1);
          }}
          placeholder="Search by name or reference"
          className="w-full rounded-full border border-line bg-surface py-2 pr-4 pl-9 text-base text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400"
        />
      </label>

      {meta && (
        <p className="text-sm text-subtle">
          {formatCount(meta.total)} {meta.total === 1 ? 'application' : 'applications'}
        </p>
      )}

      {error && (
        <div className="flex flex-col items-start gap-3">
          <ErrorAlert error={error} />
          <Button variant="subtle" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {loading && !data && <Spinner label="Loading the queue" className="py-20" />}

      {data && rows.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-base text-body">
            {tab === 'pending' ? 'Nobody is waiting to be screened.' : 'Nothing here yet.'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Applications arrive from the public form at /get-help, or are captured at the desk
            with &ldquo;New walk-in intake&rdquo;.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-xl border border-line bg-surface">
          {/* --- phones: one card per application --- */}
          <ul className="divide-y divide-line md:hidden">
            {rows.map((row) => (
              <li key={row._id} className="flex flex-col gap-2 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <Applicant row={row} />
                  <StatusPill status={row.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  <span>{INTAKE_SOURCE_LABELS[row.source]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatRelative(row.receivedAt)}</span>
                </div>
                {(programmeOf(row) || row.requestedSupport) && (
                  <p className="text-sm text-muted">
                    {programmeOf(row)?.name ?? row.requestedSupport}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {/* --- from md up: the table --- */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[52rem] border-collapse text-base">
              <caption className="sr-only">Applications awaiting a decision</caption>
              <thead>
                <tr className="border-b border-line bg-ink-25 text-left">
                  {HEADINGS.map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-4 py-3 text-xs font-semibold tracking-[0.08em] text-subtle uppercase"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id} className="border-b border-line last:border-0 hover:bg-ink-25">
                    <td className="px-4 py-3">
                      <Applicant row={row} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {INTAKE_SOURCE_LABELS[row.source]}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {programmeOf(row)?.name ?? row.requestedSupport ?? (
                        <span className="text-subtle">Not said</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {formatDate(row.receivedAt)}
                      {/* The number a supervisor actually asks about. */}
                      <span className="block text-sm text-subtle">
                        {formatRelative(row.receivedAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {meta && <Pager meta={meta} onPage={setPage} label="Intake pages" />}
    </div>
  );
}

export default IntakeQueue;
