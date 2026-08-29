'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Flame, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pager } from '@/components/ui/pager';
import { Spinner } from '@/components/ui/spinner';
import {
  beneficiaryOf,
  caseworkerOf,
  listCases,
  CASE_STATUSES,
  CASE_STATUS_LABELS,
} from '@/api/cases.api';
import type { CaseRow, CaseStatus, ListCasesQuery } from '@/api/cases.api';
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  URGENCY_LABELS,
} from '@/types/enums';
import type { ServiceCategory, UrgencyLevel } from '@/types/enums';
import { formatCount } from '@/lib/format';

/*
 * The caseload.
 *
 * A case is the ongoing file one staff member owns for one beneficiary; a service request
 * is a single ask inside it. This screen answers one question — WHICH FILES NEED ME TODAY
 * — and its structure is built around the two facts that answer it.
 *
 * PRIORITY IS A RULE DOWN THE LEFT EDGE, not a coloured pill in the middle of a row. A
 * caseload is read by scanning, and a supervisor opening this at 8am is looking for the
 * escalated files before they read a single word. Putting priority on the edge makes that
 * scan possible in one pass. The word is always printed beside it — the colour is the
 * second signal, never the only one.
 *
 * HOW LONG A FILE HAS WAITED IS A COLUMN, because in casework it is the risk. The server
 * agrees: `ageDays` is a virtual on the model, and the urgent queue is sorted oldest-first
 * precisely because "the case that has waited longest is the one at risk". An URGENT file
 * open forty days is a failure; a LOW one open forty days is routine — so the figure is
 * emphasised on escalated rows and left quiet everywhere else.
 *
 * THE BENEFICIARY IS A LINK AND THE CASE NUMBER IS NOT. There is a beneficiary record to
 * open; there is no case detail screen yet, and a row that looks clickable and goes nowhere
 * is worse than one that plainly does not.
 */

const PAGE_SIZE = 25;

/** Edge rule and label weight. URGENT and HIGH are what `isEscalated` means server-side. */
const PRIORITY_RULE: Record<UrgencyLevel, string> = {
  URGENT: 'border-l-danger-500',
  HIGH: 'border-l-accent-500',
  NORMAL: 'border-l-ink-300',
  LOW: 'border-l-ink-200',
};

const PRIORITY_TEXT: Record<UrgencyLevel, string> = {
  URGENT: 'font-semibold text-danger-700',
  HIGH: 'font-semibold text-accent-800',
  NORMAL: 'text-muted',
  LOW: 'text-subtle',
};

const STATUS_TONE: Record<CaseStatus, string> = {
  OPEN: 'bg-success-50 text-success-700',
  ON_HOLD: 'bg-accent-50 text-accent-800',
  CLOSED: 'bg-ink-100 text-ink-600',
};

/**
 * How long the file has been open, in the words a supervisor uses.
 *
 * `ageDays` counts to the closing date on a closed case and to today on an open one, so
 * "open for" is true of both — which is why the column is not called "waiting".
 */
function OpenFor({ row }: { row: CaseRow }) {
  const days = row.ageDays;
  const text = days === 0 ? 'Opened today' : `${days} ${days === 1 ? 'day' : 'days'}`;

  return (
    <span
      className={cn(
        'whitespace-nowrap',
        // Emphasis is earned by risk, not by size: a long-open routine file is not news.
        row.isEscalated ? 'font-semibold text-body' : 'text-muted'
      )}
    >
      {text}
    </span>
  );
}

function Person({ row }: { row: CaseRow }) {
  const person = beneficiaryOf(row);

  // A bare id means the server did not populate it. Printing 24 hex characters at someone
  // is worse than admitting the name is not here.
  if (!person) return <span className="text-subtle">—</span>;

  return (
    <div className="min-w-0">
      <Link
        href={`/dashboard/beneficiaries/${person._id}`}
        className="block truncate font-medium text-body underline-offset-2 hover:text-brand-600 hover:underline"
      >
        {person.firstName} {person.lastName}
      </Link>
      <span className="block truncate font-mono text-sm text-subtle">{person.referenceCode}</span>
    </div>
  );
}

const HEADINGS = ['Case', 'Person', 'Caseworker', 'Category', 'Priority', 'Open for', 'Status'];

export function CaseList() {
  const [status, setStatus] = useState<CaseStatus | ''>('');
  const [category, setCategory] = useState<ServiceCategory | ''>('');
  const [mine, setMine] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useApi(
    useCallback(
      (signal: AbortSignal) => {
        const query: ListCasesQuery = {
          page,
          limit: PAGE_SIZE,
          ...(status ? { status } : {}),
          ...(category ? { category } : {}),
          ...(mine ? { mine: true } : {}),
          ...(urgent ? { urgent: true } : {}),
        };
        return listCases(query, signal);
      },
      [page, status, category, mine, urgent]
    ),
    [page, status, category, mine, urgent]
  );

  /** Any filter change returns to page one — page 7 of a narrower filter is empty. */
  function refilter(change: () => void) {
    change();
    setPage(1);
  }

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const filtered = Boolean(status || category || mine || urgent);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Cases</h1>
        <p className="mt-1 text-base text-muted">
          {meta
            ? // Scoped rows, so this is not the organisation's caseload and must not read
              // as one — a volunteer's total is the files they captured.
              `${formatCount(meta.total)} ${meta.total === 1 ? 'file' : 'files'} you can see`
            : 'The ongoing files this organisation owns.'}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {/*
          * The two questions this screen is actually opened with, as toggles rather than
          * buried in a filter menu: "what is mine" and "what is on fire". Both are
          * aria-pressed so the state is announced, not just shaded.
          */}
        <button
          type="button"
          aria-pressed={mine}
          onClick={() => refilter(() => setMine((v) => !v))}
          className={cn(
            'inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-base font-medium transition-colors',
            mine
              ? 'border-brand-500 bg-brand-500 text-white'
              : 'border-line bg-surface text-body hover:border-line-strong'
          )}
        >
          <UserCheck className="size-4" aria-hidden="true" />
          My caseload
        </button>

        <button
          type="button"
          aria-pressed={urgent}
          onClick={() => refilter(() => setUrgent((v) => !v))}
          className={cn(
            'inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-base font-medium transition-colors',
            urgent
              ? 'border-danger-500 bg-danger-500 text-white'
              : 'border-line bg-surface text-body hover:border-line-strong'
          )}
        >
          <Flame className="size-4" aria-hidden="true" />
          Escalated only
        </button>

        <label className="flex items-center gap-2 text-base">
          <span className="sr-only">Filter by status</span>
          <select
            value={status}
            onChange={(event) => refilter(() => setStatus(event.target.value as CaseStatus | ''))}
            // The escalated queue is open files by definition; letting someone also pick
            // "Closed" would produce a guaranteed-empty list and look like a broken filter.
            disabled={urgent}
            className="min-h-10 rounded-full border border-line bg-surface px-4 text-base text-body hover:border-line-strong disabled:text-ink-400"
          >
            <option value="">Every status</option>
            {CASE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {CASE_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-base">
          <span className="sr-only">Filter by category</span>
          <select
            value={category}
            onChange={(event) =>
              refilter(() => setCategory(event.target.value as ServiceCategory | ''))
            }
            className="min-h-10 rounded-full border border-line bg-surface px-4 text-base text-body hover:border-line-strong"
          >
            <option value="">Every category</option>
            {SERVICE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {SERVICE_CATEGORY_LABELS[value]}
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

      {loading && !data && <Spinner label="Loading the caseload" className="py-20" />}

      {data && rows.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-base text-body">
            {urgent && !filteredBeyondUrgent(status, category, mine)
              ? // Worth saying warmly: an empty escalated queue is the good outcome, and
                // rendering it as "no results" makes the best state look like a failure.
                'Nothing escalated. Every open file is at normal or low priority.'
              : filtered
                ? 'No files match those filters.'
                : 'No cases have been opened yet.'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            {filtered
              ? 'Clear a filter to widen the search.'
              : 'A case is opened for a beneficiary once their needs go beyond a single request.'}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-xl border border-line bg-surface">
          {/* --- phones: one card per file --- */}
          <ul className="divide-y divide-line md:hidden">
            {rows.map((row) => (
              <li
                key={row._id}
                className={cn('flex flex-col gap-2 border-l-4 px-4 py-3.5', PRIORITY_RULE[row.priority])}
              >
                <div className="flex items-start justify-between gap-3">
                  <Person row={row} />
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap',
                      STATUS_TONE[row.status]
                    )}
                  >
                    {CASE_STATUS_LABELS[row.status]}
                  </span>
                </div>
                <p className="font-mono text-sm text-subtle">{row.caseNumber}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className={PRIORITY_TEXT[row.priority]}>
                    {URGENCY_LABELS[row.priority]}
                  </span>
                  <span aria-hidden="true" className="text-subtle">
                    ·
                  </span>
                  <span className="text-muted">{SERVICE_CATEGORY_LABELS[row.category]}</span>
                  <span aria-hidden="true" className="text-subtle">
                    ·
                  </span>
                  <OpenFor row={row} />
                </div>
              </li>
            ))}
          </ul>

          {/* --- from md up: the table, scrolling inside itself --- */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[64rem] border-collapse text-base">
              <caption className="sr-only">The caseload</caption>
              <thead>
                <tr className="border-b border-line text-left">
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
                {rows.map((row) => {
                  const worker = caseworkerOf(row);
                  return (
                    <tr
                      key={row._id}
                      className={cn(
                        'border-b border-line border-l-4 last:border-b-0 hover:bg-ink-25',
                        PRIORITY_RULE[row.priority]
                      )}
                    >
                      <td className="px-4 py-3">
                        <span className="block font-mono text-sm text-body">{row.caseNumber}</span>
                        {row.summary && (
                          <span className="mt-0.5 block max-w-[22rem] truncate text-sm text-subtle">
                            {row.summary}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Person row={row} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {worker ? worker.name : <span className="text-subtle">—</span>}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {SERVICE_CATEGORY_LABELS[row.category]}
                      </td>
                      <td className={cn('px-4 py-3 whitespace-nowrap', PRIORITY_TEXT[row.priority])}>
                        {URGENCY_LABELS[row.priority]}
                      </td>
                      <td className="px-4 py-3">
                        <OpenFor row={row} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap',
                            STATUS_TONE[row.status]
                          )}
                        >
                          {CASE_STATUS_LABELS[row.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {meta && <Pager meta={meta} onPage={setPage} label="Caseload pages" />}
    </div>
  );
}

/** True when something OTHER than the escalated toggle is also narrowing the list. */
function filteredBeyondUrgent(
  status: CaseStatus | '',
  category: ServiceCategory | '',
  mine: boolean
): boolean {
  return Boolean(status || category || mine);
}

export default CaseList;
