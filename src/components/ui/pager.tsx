'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationMeta } from '@/types/api';

/*
 * Previous / next over a paginated list.
 *
 * Extracted at the second use rather than the third: the register and the caseload need
 * the identical control, and two copies of a pager is how one of them quietly keeps a
 * disabled Next button live at the last page.
 *
 * Deliberately not numbered pages. The server caps `limit` at 100 and these lists are
 * scoped per role, so the page count is small and volatile — a row added while someone
 * reads shifts every numbered link by one. "Page 2 of 9" states the position without
 * offering nine targets that are only true for this second.
 */

export interface PagerProps {
  meta: PaginationMeta;
  onPage: (page: number) => void;
  /** Names what is being paged, for the landmark: "Register pages", "Caseload pages". */
  label: string;
}

const BUTTON =
  'inline-flex min-h-10 items-center gap-1 rounded-full border border-line bg-surface px-4 text-sm font-medium text-body hover:border-line-strong disabled:pointer-events-none disabled:text-ink-400';

export function Pager({ meta, onPage, label }: PagerProps) {
  // One page is not a pager. Rendering a pair of dead buttons under every short list
  // reads as a broken control rather than an absent one.
  if (meta.pages <= 1) return null;

  return (
    <nav aria-label={label} className="flex items-center justify-between gap-4">
      <p className="text-sm text-muted">
        Page <span className="font-semibold text-body">{meta.page}</span> of {meta.pages}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, meta.page - 1))}
          disabled={!meta.hasPrev}
          className={BUTTON}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPage(meta.page + 1)}
          disabled={!meta.hasNext}
          className={BUTTON}
        >
          Next
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

export default Pager;
