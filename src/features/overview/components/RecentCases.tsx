'use client';

import { AlertTriangle, CircleDot, PauseCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/dates';
import { SERVICE_CATEGORY_LABELS, URGENCY_LABELS } from '@/types/enums';
import { CASE_STATUS_LABELS, beneficiaryOf, caseworkerOf } from '@/api/cases.api';
import type { CaseRow, CaseStatus } from '@/api/cases.api';

/*
 * The most recently opened case files.
 *
 * WHAT IS NOT IN THIS TABLE, and must not be added: date of birth, permit number,
 * immigration status, vulnerability flags, phone number. The list endpoint populates a
 * beneficiary's reference code and name and nothing else, deliberately — an overview screen
 * is read by whoever walks past it, and the reference code is what a caseworker quotes down
 * a phone anyway.
 *
 * TWO LAYOUTS, ONE SET OF DATA. The reference this follows is a desktop template and its
 * tables simply scroll sideways on a phone. Intake here is done on phones, and a
 * seven-column table on a 360px screen is a horizontal scrollbar with a row of truncations
 * behind it. So below `md` each case is a card, and the columns become labelled lines.
 */

const STATUS_STYLE: Record<CaseStatus, { className: string; Icon: typeof CircleDot }> = {
  // Colour is never the only signal: every pill carries its word and a glyph, so the state
  // survives grayscale, forced-colors and colour-vision deficiency.
  OPEN: { className: 'bg-success-50 text-success-700', Icon: CircleDot },
  ON_HOLD: { className: 'bg-accent-50 text-accent-800', Icon: PauseCircle },
  CLOSED: { className: 'bg-ink-100 text-ink-600', Icon: CircleDot },
};

function StatusPill({ status }: { status: CaseStatus }) {
  const { className, Icon } = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        className
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {CASE_STATUS_LABELS[status]}
    </span>
  );
}

function Priority({ row }: { row: CaseRow }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-semibold',
        row.isEscalated ? 'text-danger-700' : 'text-muted'
      )}
    >
      {row.isEscalated && <AlertTriangle className="size-3.5" aria-hidden="true" />}
      {URGENCY_LABELS[row.priority]}
    </span>
  );
}

/** Initials, so a row can be found by shape before it is read. Never a photograph — the
 *  register holds no images of people and generating one would invent a face. */
function Initials({ first, last }: { first: string; last: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700"
    >
      {`${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase()}
    </span>
  );
}

function openFor(row: CaseRow) {
  if (row.ageDays === 0) return 'opened today';
  return `${row.ageDays} day${row.ageDays === 1 ? '' : 's'} open`;
}

const HEADINGS = ['Beneficiary', 'Case', 'Opened', 'Need', 'Priority', 'Status', 'Caseworker'];

export interface RecentCasesProps {
  cases: CaseRow[];
}

export function RecentCases({ cases }: RecentCasesProps) {
  if (cases.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-sm text-body">No cases are open.</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
          A case is opened from a beneficiary&rsquo;s record when someone takes ownership of
          their situation.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* --- phones: one card per case, columns become labelled lines --- */}
      <ul className="divide-y divide-line md:hidden">
        {cases.map((row) => {
          const beneficiary = beneficiaryOf(row);
          const caseworker = caseworkerOf(row);

          return (
            <li key={row._id} className="flex flex-col gap-2.5 px-4 py-4">
              <div className="flex items-start gap-3">
                {beneficiary && (
                  <Initials first={beneficiary.firstName} last={beneficiary.lastName} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-body">
                    {beneficiary ? `${beneficiary.firstName} ${beneficiary.lastName}` : row.caseNumber}
                  </p>
                  <p className="truncate font-mono text-xs text-subtle">
                    {beneficiary?.referenceCode ?? row.caseNumber}
                  </p>
                </div>
                <StatusPill status={row.status} />
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>{SERVICE_CATEGORY_LABELS[row.category]}</span>
                <span aria-hidden="true">·</span>
                <Priority row={row} />
                <span aria-hidden="true">·</span>
                <span>{openFor(row)}</span>
              </div>

              <p className="text-xs text-subtle">
                {caseworker ? `With ${caseworker.name}` : 'Unassigned'}
              </p>
            </li>
          );
        })}
      </ul>

      {/* --- from md up: the table. Scrolls inside itself, never the page. --- */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <caption className="sr-only">The most recently opened case files</caption>
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
            {cases.map((row) => {
              const beneficiary = beneficiaryOf(row);
              const caseworker = caseworkerOf(row);

              return (
                <tr key={row._id} className="border-b border-line last:border-0 hover:bg-ink-25">
                  <td className="px-4 py-3">
                    {beneficiary ? (
                      <div className="flex items-center gap-3">
                        <Initials first={beneficiary.firstName} last={beneficiary.lastName} />
                        <div className="min-w-0">
                          <span className="block truncate font-medium text-body">
                            {beneficiary.firstName} {beneficiary.lastName}
                          </span>
                          <span className="block truncate font-mono text-xs text-subtle">
                            {beneficiary.referenceCode}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>

                  {/* Reference codes are a column of identifiers: tabular figures align them. */}
                  <td
                    className="px-4 py-3 font-mono text-xs whitespace-nowrap text-muted"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {row.caseNumber}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {formatDate(row.openedAt)}
                    {/* The number a supervisor actually asks about. */}
                    <span className="block text-xs text-subtle">{openFor(row)}</span>
                  </td>

                  <td className="px-4 py-3 text-muted">{SERVICE_CATEGORY_LABELS[row.category]}</td>
                  <td className="px-4 py-3">
                    <Priority row={row} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {caseworker?.name ?? (
                      // Unowned work is the kind most likely to become nobody's problem.
                      <span className="text-danger-700">Unassigned</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default RecentCases;
