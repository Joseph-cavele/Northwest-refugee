'use client';

import { AlertTriangle, Circle, PauseCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/dates';
import { SERVICE_CATEGORY_LABELS, URGENCY_LABELS } from '@/types/enums';
import { CASE_STATUS_LABELS, beneficiaryOf, caseworkerOf } from '@/api/cases.api';
import type { CaseRow, CaseStatus } from '@/api/cases.api';

/*
 * The most recently opened case files.
 *
 * The reference layout puts a booking table here; this is its NWHR equivalent — the rows a
 * caseworker actually opens from a dashboard.
 *
 * WHAT IS NOT IN THIS TABLE, and must not be added: date of birth, permit number,
 * immigration status, vulnerability flags, phone number. The list endpoint populates a
 * beneficiary's reference code and name and nothing else, deliberately — an overview screen
 * is read by whoever walks past it. The reference code is what a caseworker quotes.
 */

const STATUS_STYLE: Record<CaseStatus, { className: string; Icon: typeof Circle }> = {
  // Colour is never the only signal: each pill carries a word, and now an icon too, for
  // grayscale, forced-colors, and colour-vision deficiency.
  OPEN: { className: 'bg-success-50 text-success-700', Icon: Circle },
  ON_HOLD: { className: 'bg-accent-50 text-accent-800', Icon: PauseCircle },
  CLOSED: { className: 'bg-ink-100 text-ink-600', Icon: Circle },
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

export interface RecentCasesProps {
  cases: CaseRow[];
}

export function RecentCases({ cases }: RecentCasesProps) {
  if (cases.length === 0) {
    return <p className="p-6 text-sm text-muted">No cases have been opened yet.</p>;
  }

  return (
    // The table scrolls inside its own container; the page never scrolls sideways.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-sm">
        <caption className="sr-only">The eight most recently opened case files</caption>
        <thead>
          <tr className="border-b border-line text-left">
            {['Case', 'Beneficiary', 'Opened', 'Need', 'Priority', 'Status', 'Caseworker'].map(
              (heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold tracking-wide text-subtle uppercase"
                >
                  {heading}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {cases.map((row) => {
            const beneficiary = beneficiaryOf(row);
            const caseworker = caseworkerOf(row);

            return (
              <tr key={row._id} className="border-b border-line last:border-0 hover:bg-ink-25">
                {/* Reference codes are a column of identifiers — tabular figures align them. */}
                <td className="px-4 py-3 font-mono text-xs text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {row.caseNumber}
                </td>
                <td className="px-4 py-3">
                  {beneficiary ? (
                    <>
                      <span className="font-medium text-body">
                        {beneficiary.firstName} {beneficiary.lastName}
                      </span>
                      <span className="block font-mono text-xs text-subtle">
                        {beneficiary.referenceCode}
                      </span>
                    </>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">
                  {formatDate(row.openedAt)}
                  <span className="block text-xs text-subtle">
                    {row.ageDays === 0 ? 'today' : `${row.ageDays} day${row.ageDays === 1 ? '' : 's'} open`}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{SERVICE_CATEGORY_LABELS[row.category]}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs font-semibold',
                      row.isEscalated ? 'text-danger-700' : 'text-muted'
                    )}
                  >
                    {row.isEscalated && <AlertTriangle className="size-3.5" aria-hidden="true" />}
                    {URGENCY_LABELS[row.priority]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={row.status} />
                </td>
                <td className="px-4 py-3 text-muted">{caseworker?.name ?? 'Unassigned'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default RecentCases;
