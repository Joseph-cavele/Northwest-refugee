'use client';

import { AlertTriangle } from 'lucide-react';
import { SERVICE_CATEGORY_LABELS } from '@/types/enums';
import { beneficiaryOf } from '@/api/cases.api';
import type { CaseRow } from '@/api/cases.api';

/*
 * What is escalated and still open, oldest first.
 *
 * The reference layout has a to-do list here. This is the honest equivalent: NWHR has no
 * task collection, and a checklist a user could tick would be a list of items the server
 * never stored. These are real case files, and the ordering is the point — the case that
 * has waited longest is the one at risk.
 *
 * "Urgent" means HIGH or URGENT priority AND still workable. A closed case is never urgent,
 * which is enforced in case.service.js rather than assumed here.
 */

export interface UrgentQueueProps {
  cases: CaseRow[];
}

export function UrgentQueue({ cases }: UrgentQueueProps) {
  if (cases.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-muted">
        Nothing escalated is open. This is the state to aim for.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-line">
      {cases.map((row) => {
        const beneficiary = beneficiaryOf(row);

        return (
          <li key={row._id} className="flex items-start gap-3 px-5 py-3.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger-500" aria-hidden="true" />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-body">
                {beneficiary ? `${beneficiary.firstName} ${beneficiary.lastName}` : row.caseNumber}
              </p>
              <p className="truncate text-xs text-muted">
                {SERVICE_CATEGORY_LABELS[row.category]}
              </p>
            </div>

            <div className="shrink-0 text-right">
              {/* Days open is the number a supervisor actually asks about. */}
              <p className="text-sm font-semibold text-body" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {row.ageDays}
              </p>
              <p className="text-xs text-subtle">{row.ageDays === 1 ? 'day' : 'days'}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default UrgentQueue;
