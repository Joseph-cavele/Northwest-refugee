'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, Search, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useDebounce } from '@/hooks/useDebounce';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pager } from '@/components/ui/pager';
import { Spinner } from '@/components/ui/spinner';
import { listBeneficiaries } from '@/api/beneficiaries.api';
import type { BeneficiaryRow, ListBeneficiariesQuery } from '@/api/beneficiaries.api';
import { StatusPill } from './StatusPill';
import {
  BENEFICIARY_STATUSES,
  BENEFICIARY_STATUS_LABELS,
  IMMIGRATION_STATUS_LABELS,
} from '@/types/enums';
import type { BeneficiaryStatus } from '@/types/enums';
import { formatDate } from '@/lib/dates';
import { formatCount } from '@/lib/format';

/*
 * The register.
 *
 * WHAT THIS SCREEN RENDERS IS A NARROWER THING THAN WHAT THE API RETURNS. The list response
 * also carries date of birth, cellphone, household, guardian and free-text notes. Every one
 * of those is legitimately readable by a holder of beneficiary:read — and none of them
 * belongs in a table that fills a monitor at a front desk with people queuing behind it.
 * They belong on a record someone has deliberately opened.
 *
 * Two things here are NOT a design preference:
 *
 *   MINOR   shown as a flag, never as a birthday. "Is this person a child" drives
 *           child-protection handling and must not be buried; the date that answers it is
 *           not needed to act on it.
 *   PERMIT  shown as a state and a date, never as a number. The number is select:false on
 *           the server and reaching it costs an audit entry, which is the point.
 *
 * Rows are scoped server-side, so the count in the header is the count THIS user may see —
 * a volunteer's register is the people they captured, and that is what the copy says.
 */

const PAGE_SIZE = 25;

/**
 * Days until a permit lapses, or how long ago it did. Never the permit number.
 *
 * `now` is passed in rather than read here. Reading the clock during render makes the
 * component impure — the same row would produce different output on a re-render React
 * had every right to discard — which is what react-hooks/purity objects to, and the
 * objection is not pedantic: with Date.now() inline, two rows in one table are timed
 * against two different instants. One instant per screen is both correct and simpler.
 */
function Permit({ row, now }: { row: BeneficiaryRow; now: number }) {
  const expiry = row.immigration.permitExpiresAt;
  if (!expiry) return <span className="text-subtle">—</span>;

  const days = Math.round((new Date(expiry).getTime() - now) / 86_400_000);

  if (row.permitExpired || days < 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger-700">
        <AlertTriangle className="size-3.5" aria-hidden="true" />
        Expired {formatDate(expiry)}
      </span>
    );
  }

  // 30 days is the horizon the expiry job works to, so it is the horizon shown here.
  const soon = days <= 30;
  return (
    <span className={cn('text-xs', soon ? 'font-semibold text-accent-800' : 'text-muted')}>
      {soon ? `${days} day${days === 1 ? '' : 's'} left` : formatDate(expiry)}
    </span>
  );
}

/**
 * The person, and the way through to their record.
 *
 * The NAME is the link, not the whole row. A row-sized target sounds friendlier and is
 * worse here: it swallows text selection, so a caseworker cannot copy a reference code
 * off the screen to read down a phone, and it gives a screen reader one enormous
 * unlabelled link per person instead of a name.
 */
function Identity({ row }: { row: BeneficiaryRow }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700"
      >
        {`${row.firstName[0] ?? ''}${row.lastName[0] ?? ''}`.toUpperCase()}
      </span>
      <div className="min-w-0">
        <span className="flex items-center gap-2">
          <Link
            href={`/dashboard/beneficiaries/${row._id}`}
            className="truncate font-medium text-body underline-offset-2 hover:text-brand-600 hover:underline"
          >
            {row.firstName} {row.lastName}
          </Link>
          {row.isMinor && (
            /* A word and a glyph, never a colour on its own — and never the birthday. */
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-[0.625rem] font-bold tracking-wide text-danger-700 uppercase">
              <ShieldAlert className="size-3" aria-hidden="true" />
              Minor
            </span>
          )}
        </span>
        <span className="block truncate font-mono text-xs text-subtle">{row.referenceCode}</span>
      </div>
    </div>
  );
}

const HEADINGS = ['Person', 'Status', 'Immigration', 'Nationality', 'Permit', 'Registered'];

export function BeneficiaryList() {
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<BeneficiaryStatus | ''>('');
  const [page, setPage] = useState(1);

  /*
   * One instant for the whole screen, fixed when it opens.
   *
   * A lazy initialiser runs once, on mount — not on the re-renders that a paging or
   * filter change causes — so every "days left" below is measured from the same moment
   * and the render stays a pure function of its inputs.
   */
  const [now] = useState(() => Date.now());

  // A text search on two letters matches most of the register and tells nobody anything.
  const search = useDebounce(term.trim(), 300);

  const { data, loading, error, reload } = useApi(
    // The query is built INSIDE the callback rather than captured from the render, so the
    // dependency list is the whole truth about what this fetch depends on.
    useCallback(
      (signal: AbortSignal) => {
        const query: ListBeneficiariesQuery = {
          page,
          limit: PAGE_SIZE,
          ...(search.length >= 3 ? { search } : {}),
          ...(status ? { status } : {}),
        };
        return listBeneficiaries(query, signal);
      },
      [page, search, status]
    ),
    [page, search, status]
  );

  /** Any filter change puts the reader back on page one — page 7 of a new filter is empty. */
  function refilter(change: () => void) {
    change();
    setPage(1);
  }

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Beneficiaries</h1>
        <p className="mt-1 text-sm text-muted">
          {meta
            ? // "you can see" is not filler: the rows are scoped, so this is not the
              // organisation's total and must not be read as one.
              `${formatCount(meta.total)} ${meta.total === 1 ? 'person' : 'people'} you can see`
            : 'The people this organisation serves.'}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Search by name or reference code</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
            aria-hidden="true"
          />
          <input
            type="search"
            value={term}
            onChange={(event) => refilter(() => setTerm(event.target.value))}
            placeholder="Search by name or reference code"
            className="w-full rounded-full border border-line bg-surface py-2 pr-4 pl-9 text-sm text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Filter by status</span>
          <select
            value={status}
            onChange={(event) =>
              refilter(() => setStatus(event.target.value as BeneficiaryStatus | ''))
            }
            className="rounded-full border border-line bg-surface px-4 py-2 text-sm text-body hover:border-line-strong"
          >
            <option value="">Every status</option>
            {BENEFICIARY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {BENEFICIARY_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        {term.length > 0 && term.trim().length < 3 && (
          // Said plainly rather than silently returning everything: the server matches whole
          // words on a text index, so two letters is not a narrower search, it is no search.
          <p className="text-xs text-subtle">Keep typing — search needs three letters.</p>
        )}
      </div>

      {error && (
        <div className="flex flex-col items-start gap-3">
          <ErrorAlert error={error} />
          <Button variant="subtle" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {loading && !data && <Spinner label="Loading the register" className="py-20" />}

      {data && rows.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-sm text-body">
            {search || status ? 'Nobody matches those filters.' : 'Nobody is on the register yet.'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            {search || status
              ? 'Search matches whole names and full reference codes, not partial words.'
              : 'People arrive through the front desk or the WhatsApp bot. Consent is recorded before anything is stored.'}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-xl border border-line bg-surface">
          {/* --- phones: one card per person --- */}
          <ul className="divide-y divide-line md:hidden">
            {rows.map((row) => (
              <li key={row._id} className="flex flex-col gap-2 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <Identity row={row} />
                  <StatusPill status={row.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{IMMIGRATION_STATUS_LABELS[row.immigration.status]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{row.nationality}</span>
                  <span aria-hidden="true">·</span>
                  <Permit row={row} now={now} />
                </div>
                {/*
                  * A second, larger target on a phone. The name above is still the link;
                  * this one exists because a 14px name is a poor thing to hit with a thumb.
                  * `aria-hidden` on the wrapper would hide the name, so instead this link
                  * names the person it opens and the icon carries nothing.
                  */}
                <Link
                  href={`/dashboard/beneficiaries/${row._id}`}
                  className="inline-flex min-h-9 items-center gap-1 self-start text-xs font-semibold text-brand-600"
                >
                  Open record
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">
                    for {row.firstName} {row.lastName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {/* --- from md up: the table, scrolling inside itself --- */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[58rem] border-collapse text-sm">
              <caption className="sr-only">The beneficiary register</caption>
              <thead>
                <tr className="border-b border-line text-left">
                  {HEADINGS.map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-4 py-3 text-[0.6875rem] font-semibold tracking-[0.08em] text-subtle uppercase"
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
                      <Identity row={row} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {IMMIGRATION_STATUS_LABELS[row.immigration.status]}
                    </td>
                    <td className="px-4 py-3 text-muted">{row.nationality}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Permit row={row} now={now} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {formatDate(row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {meta && <Pager meta={meta} onPage={setPage} label="Register pages" />}
    </div>
  );
}

export default BeneficiaryList;
