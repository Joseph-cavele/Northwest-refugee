'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Clock, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pager } from '@/components/ui/pager';
import { Spinner } from '@/components/ui/spinner';
import {
  assigneeOfRequest,
  beneficiaryOfRequest,
  listServiceRequests,
} from '@/api/serviceRequests.api';
import type { ListServiceRequestsQuery, ServiceRequestRow } from '@/api/serviceRequests.api';
import { StatusDialog } from './StatusDialog';
import { describeSla } from './lib/sla';
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  SERVICE_REQUEST_STATUSES,
  SERVICE_REQUEST_STATUS_LABELS,
  URGENCY_LABELS,
} from '@/types/enums';
import type { ServiceCategory, ServiceRequestStatus, UrgencyLevel } from '@/types/enums';
import { formatCount } from '@/lib/format';
import { formatDate } from '@/lib/dates';

/*
 * The service-request queue.
 *
 * A request is ONE thing someone asked for; a case is the relationship those asks sit
 * inside. So this screen is organised around a different fact from the caseload: a case is
 * OWNED, a request is DUE.
 *
 * THE DEADLINE IS THE SPINE. `dueAt` is derived from urgency when the request is raised —
 * URGENT one day, HIGH three, NORMAL seven, LOW fourteen — and the server sorts by it
 * ascending by default, which means the list arrives already in the order the work should
 * be done. The Due column is therefore the one carrying emphasis, and it reads as a signed
 * quantity against a promise: "4 days late", "Due today", "in 5 days".
 *
 * NO LEFT-EDGE RULE HERE, deliberately. The caseload uses one to encode priority; reusing
 * the same device for a different meaning one screen over is how a reader learns the wrong
 * lesson about what a coloured edge means.
 *
 * A finished request is never late. See lib/sla.ts — the terminal check runs before the
 * date, so a queue of completed work does not slowly fill with red nobody can act on.
 */

const PAGE_SIZE = 25;

const STATUS_TONE: Record<ServiceRequestStatus, string> = {
  OPEN: 'bg-brand-50 text-brand-700',
  IN_PROGRESS: 'bg-info-50 text-info-700',
  ON_HOLD: 'bg-accent-50 text-accent-800',
  RESOLVED: 'bg-success-50 text-success-700',
  REFERRED: 'bg-ink-100 text-ink-600',
  CANCELLED: 'bg-ink-100 text-ink-600',
};

const URGENCY_TEXT: Record<UrgencyLevel, string> = {
  URGENT: 'font-semibold text-danger-700',
  HIGH: 'font-semibold text-accent-800',
  NORMAL: 'text-muted',
  LOW: 'text-subtle',
};

/** Where the request stands against the time it was promised in. Never a bare date. */
function Due({ row, now }: { row: ServiceRequestRow; now: number }) {
  const sla = describeSla({
    dueAt: row.dueAt,
    isTerminal: row.isTerminal,
    serverSaysOverdue: row.isOverdue,
    now,
  });

  switch (sla.kind) {
    case 'OVERDUE':
      return (
        <span className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap text-danger-700">
          <Clock className="size-3.5" aria-hidden="true" />
          {sla.days} {sla.days === 1 ? 'day' : 'days'} late
        </span>
      );
    case 'DUE_TODAY':
      return (
        <span className="font-semibold whitespace-nowrap text-accent-800">Due today</span>
      );
    case 'DUE':
      return (
        <span className="whitespace-nowrap text-muted">
          in {sla.days} {sla.days === 1 ? 'day' : 'days'}
          <span className="ml-1.5 text-subtle">{formatDate(row.dueAt)}</span>
        </span>
      );
    case 'DONE':
      // The work is finished; how it sat against its deadline is history, not a queue item.
      return <span className="whitespace-nowrap text-subtle">Closed</span>;
    case 'NONE':
      return <span className="text-subtle">—</span>;
  }
}

function Person({ row }: { row: ServiceRequestRow }) {
  const person = beneficiaryOfRequest(row);
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

const HEADINGS = ['Request', 'Person', 'Category', 'Urgency', 'Due', 'Status', 'Assigned'];

export function ServiceRequestList() {
  const { can } = useAuth();
  const mayUpdate = can(PERMISSIONS.SERVICE_REQUEST_UPDATE);

  const [now] = useState(() => Date.now());
  const [status, setStatus] = useState<ServiceRequestStatus | ''>('');
  const [category, setCategory] = useState<ServiceCategory | ''>('');
  const [mine, setMine] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ServiceRequestRow | null>(null);

  const { data, loading, error, reload } = useApi(
    useCallback(
      (signal: AbortSignal) => {
        const query: ListServiceRequestsQuery = {
          page,
          limit: PAGE_SIZE,
          ...(status ? { status } : {}),
          ...(category ? { category } : {}),
          ...(mine ? { mine: true } : {}),
          ...(overdue ? { overdue: true } : {}),
        };
        return listServiceRequests(query, signal);
      },
      [page, status, category, mine, overdue]
    ),
    [page, status, category, mine, overdue]
  );

  function refilter(change: () => void) {
    change();
    setPage(1);
  }

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const narrowedBeyondOverdue = Boolean(status || category || mine);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Service requests</h1>
        <p className="mt-1 text-base text-muted">
          {meta
            ? `${formatCount(meta.total)} ${meta.total === 1 ? 'request' : 'requests'} you can see`
            : 'One thing each person asked for, and when it was promised.'}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
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
          Assigned to me
        </button>

        <button
          type="button"
          aria-pressed={overdue}
          onClick={() => refilter(() => setOverdue((v) => !v))}
          className={cn(
            'inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-base font-medium transition-colors',
            overdue
              ? 'border-danger-500 bg-danger-500 text-white'
              : 'border-line bg-surface text-body hover:border-line-strong'
          )}
        >
          <Clock className="size-4" aria-hidden="true" />
          Overdue only
        </button>

        <label className="flex items-center gap-2 text-base">
          <span className="sr-only">Filter by status</span>
          <select
            value={status}
            onChange={(event) =>
              refilter(() => setStatus(event.target.value as ServiceRequestStatus | ''))
            }
            // Overdue is open work by definition; offering a terminal status alongside it
            // would guarantee an empty list and look like a broken filter.
            disabled={overdue}
            className="min-h-10 rounded-full border border-line bg-surface px-4 text-base text-body hover:border-line-strong disabled:text-ink-400"
          >
            <option value="">Every status</option>
            {SERVICE_REQUEST_STATUSES.map((value) => (
              <option key={value} value={value}>
                {SERVICE_REQUEST_STATUS_LABELS[value]}
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

      {loading && !data && <Spinner label="Loading the queue" className="py-20" />}

      {data && rows.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-base text-body">
            {overdue && !narrowedBeyondOverdue
              ? // The good outcome. Rendering it as "no results" makes the best state on
                // this screen look like a failure.
                'Nothing is overdue. Every open request is still inside its promised time.'
              : status || category || mine || overdue
                ? 'No requests match those filters.'
                : 'No service requests have been raised yet.'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Requests arrive from the front desk or the WhatsApp bot, and are due within the
            time their urgency promises.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-xl border border-line bg-surface">
          {/* --- phones: one card per request --- */}
          <ul className="divide-y divide-line md:hidden">
            {rows.map((row) => (
              <li key={row._id} className="flex flex-col gap-2 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <Person row={row} />
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap',
                      STATUS_TONE[row.status]
                    )}
                  >
                    {SERVICE_REQUEST_STATUS_LABELS[row.status]}
                  </span>
                </div>
                <p className="font-mono text-sm text-subtle">{row.reference}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-muted">{SERVICE_CATEGORY_LABELS[row.category]}</span>
                  <span aria-hidden="true" className="text-subtle">
                    ·
                  </span>
                  <span className={URGENCY_TEXT[row.urgency]}>{URGENCY_LABELS[row.urgency]}</span>
                  <span aria-hidden="true" className="text-subtle">
                    ·
                  </span>
                  <Due row={row} now={now} />
                </div>
                {mayUpdate && !row.isTerminal && (
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="min-h-9 self-start text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
                  >
                    Update status
                    <span className="sr-only"> for {row.reference}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>

          {/* --- from md up: the table, scrolling inside itself --- */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[68rem] border-collapse text-base">
              <caption className="sr-only">The service-request queue</caption>
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
                  {mayUpdate && (
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const assignee = assigneeOfRequest(row);
                  return (
                    <tr key={row._id} className="border-b border-line last:border-0 hover:bg-ink-25">
                      <td className="px-4 py-3">
                        <span className="block font-mono text-sm text-body">{row.reference}</span>
                        {row.description && (
                          <span className="mt-0.5 block max-w-[20rem] truncate text-sm text-subtle">
                            {row.description}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Person row={row} />
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {SERVICE_CATEGORY_LABELS[row.category]}
                      </td>
                      <td className={cn('px-4 py-3 whitespace-nowrap', URGENCY_TEXT[row.urgency])}>
                        {URGENCY_LABELS[row.urgency]}
                      </td>
                      <td className="px-4 py-3">
                        <Due row={row} now={now} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap',
                            STATUS_TONE[row.status]
                          )}
                        >
                          {SERVICE_REQUEST_STATUS_LABELS[row.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {assignee ? assignee.name : <span className="text-subtle">Unassigned</span>}
                      </td>
                      {mayUpdate && (
                        <td className="px-4 py-3 text-right">
                          {/* A terminal request has no moves, so it gets no control —
                              rather than one that opens a dialog saying "no". */}
                          {!row.isTerminal && (
                            <button
                              type="button"
                              onClick={() => setEditing(row)}
                              className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-body hover:border-line-strong hover:bg-ink-50"
                            >
                              Update
                              <span className="sr-only"> {row.reference}</span>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {meta && <Pager meta={meta} onPage={setPage} label="Queue pages" />}

      {editing && (
        <StatusDialog
          request={editing}
          open
          onClose={() => setEditing(null)}
          onDone={reload}
        />
      )}
    </div>
  );
}

export default ServiceRequestList;
