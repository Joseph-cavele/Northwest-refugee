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
 *
 * --- THE WAIT BAR -----------------------------------------------------------------------
 *
 * Each row draws its own wait as a measure, scaled against the longest wait in the queue.
 * This is the one piece of visual invention on the screen, and it is here rather than on a
 * chart because of what the queue actually is.
 *
 * A support dashboard would rank this list by priority, because in a support queue the
 * severity is the property that matters. NWHR's queue is not that. Every row here is ALREADY
 * escalated — priority has stopped discriminating between them — and the only thing still
 * separating one row from the next is how long a person has been waiting for it. Drawing
 * that turns a list of five names into a picture of a backlog: a queue where the top bar is
 * twice the length of the bottom one is a different operational problem from a queue where
 * all five are level, and the numbers alone do not show that at a glance.
 *
 * IT IS A COMPARISON AID, NEVER THE VALUE. The day count is printed on every row and is the
 * thing a supervisor quotes; the bar only says "this one, relative to the others". That is
 * also why it survives grayscale and forced-colors — remove the colour and the row still
 * reads completely.
 *
 * SCALED AGAINST THE QUEUE'S OWN LONGEST WAIT, not against a fixed ceiling. There is no
 * service standard stored per case for escalated work, so a bar drawn against "14 days" or
 * any other round number would be measuring against a threshold nobody set. The peak is a
 * fact about this queue; an invented target would not be.
 */

export interface UrgentQueueProps {
  cases: CaseRow[];
}

export function UrgentQueue({ cases }: UrgentQueueProps) {
  if (cases.length === 0) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-5 py-10 text-center">
        <p className="text-base text-body">Nothing escalated is open.</p>
        <p className="max-w-[28ch] text-sm text-muted">This is the state to aim for.</p>
      </div>
    );
  }

  // Guarded at 1: an empty queue returns above, but a queue of cases all opened today would
  // otherwise divide by zero and paint every bar as NaN%.
  const longestWait = Math.max(...cases.map((row) => row.ageDays), 1);

  return (
    <ol className="divide-y divide-line">
      {cases.map((row) => {
        const beneficiary = beneficiaryOf(row);
        const share = (row.ageDays / longestWait) * 100;

        return (
          <li key={row._id} className="group flex flex-col gap-2.5 px-5 py-4 transition-colors hover:bg-danger-50/40">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-danger-500"
                aria-hidden="true"
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium text-body">
                  {beneficiary ? `${beneficiary.firstName} ${beneficiary.lastName}` : row.caseNumber}
                </p>
                <p className="truncate text-sm text-muted">
                  {SERVICE_CATEGORY_LABELS[row.category]}
                </p>
              </div>

              <div className="shrink-0 text-right">
                {/* Days open is the number a supervisor actually asks about. Tabular, because
                    these stack into a column and a ragged one is harder to compare. */}
                <p
                  className="text-lg leading-none font-semibold text-body"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {row.ageDays}
                </p>
                <p className="mt-1 text-sm text-subtle">{row.ageDays === 1 ? 'day' : 'days'}</p>
              </div>
            </div>

            {/*
              * The measure. Inset to clear the glyph above it so the bars form one column
              * the eye can run down, which is the whole point of drawing them.
              *
              * Red, and this is the one list where that is right: every row is escalated, so
              * the colour is not ranking the rows against each other — it is stating what the
              * whole queue is. A neutral bar here would read as ordinary progress.
              */}
            <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-danger-500 transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${Math.max(share, 6)}%` }}
                aria-hidden="true"
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default UrgentQueue;
