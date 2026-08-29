'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { listBeneficiaries } from '@/api/beneficiaries.api';
import type { BeneficiaryRow } from '@/api/beneficiaries.api';
import { BENEFICIARY_STATUS_LABELS } from '@/types/enums';

/*
 * Front-desk lookup: is this person on the register?
 *
 * The one question the search box in the reference layout can honestly answer here. It
 * searches the server's text index over first name, last name and reference code — so it
 * matches whole words, not prefixes: "Thandiwe" finds her, "Tha" does not.
 *
 * A RESULT IS BOTH THE ANSWER AND THE WAY IN. Name, reference code and status is usually
 * the whole answer at a front desk — someone is checking a person is on the register and
 * quoting the code back to them — so those are rendered plainly rather than hidden behind
 * a click. Each row also opens the record, now that there is one to open.
 *
 * WHAT THIS DELIBERATELY DOES NOT SHOW: date of birth, permit number, immigration status,
 * vulnerability flags, phone. The list endpoint does not return them and this must never
 * start asking for them — a topbar is read by whoever is standing behind the desk.
 *
 * Rows are already scoped server-side: a volunteer searching finds only people they
 * captured, and out-of-scope records are absent rather than refused.
 */

export function TopBarSearch({ className }: { className?: string }) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // A text search on two letters matches most of the register and tells nobody anything.
  const query = useDebounce(term.trim(), 300);
  const longEnough = query.length >= 3;

  /*
   * The answer is stored WITH the question it answers, and what to show is derived from
   * whether the two still match. Holding a separate `results` and clearing it when the term
   * gets too short would be a synchronous setState inside an effect — a second render
   * before the browser has painted the first — to express something already knowable from
   * the state we hold. It also fixes a real flicker: while a new query is in flight, the
   * previous query's rows are not shown as though they answered it.
   */
  const [answered, setAnswered] = useState<{ query: string; rows: BeneficiaryRow[] } | null>(null);

  useEffect(() => {
    if (!longEnough) return;

    const controller = new AbortController();

    listBeneficiaries({ search: query, limit: 6 }, controller.signal)
      .then((page) => {
        // The list endpoint is paginated now; the panel wants the rows, not the totals.
        if (!controller.signal.aborted) setAnswered({ query, rows: page.data });
      })
      .catch(() => {
        // A failed lookup is not worth a banner over the whole dashboard. The panel simply
        // reports nothing found; the person retypes or opens the register.
        if (!controller.signal.aborted) setAnswered({ query, rows: [] });
      });

    return () => controller.abort();
  }, [query, longEnough]);

  const results = longEnough && answered?.query === query ? answered.rows : null;
  // Typed enough to search, and the answer for THIS query has not arrived yet.
  const busy = longEnough && results === null;

  // Dismiss on an outside click. Without it the panel hangs over the page after the user
  // has moved on, covering content they are trying to read.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const showPanel = open && longEnough;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <label className="relative block">
        <span className="sr-only">Search the beneficiary register by name or reference code</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
          aria-hidden="true"
        />
        <input
          type="search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
          placeholder="Search by name or reference code"
          className={cn(
            'w-full rounded-full border border-line bg-canvas py-2 pr-9 pl-9 text-base text-body',
            'placeholder:text-subtle hover:border-line-strong focus:border-brand-400 focus:bg-surface',
            'transition-colors outline-none'
          )}
        />
        {busy && (
          <Loader2
            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-subtle"
            aria-hidden="true"
          />
        )}
      </label>

      {showPanel && (
        <div
          // Announced, not alerting: results arriving is a confirmation, not something the
          // user must act on.
          role="status"
          className="absolute top-full right-0 left-0 z-30 mt-2 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          {/* Tested on `results` rather than `busy` so TypeScript narrows it — inside this
              panel `longEnough` is already true, so the two say the same thing. */}
          {!results ? (
            <p className="px-4 py-3 text-base text-subtle">Searching…</p>
          ) : results.length === 0 ? (
            <div className="px-4 py-3">
              <p className="text-base text-body">Nobody matches “{query}”.</p>
              <p className="mt-1 text-sm text-subtle">
                Search matches whole names and full reference codes, not partial words.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {results.map((row) => (
                <li key={row._id}>
                  <Link
                    href={`/dashboard/beneficiaries/${row._id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-25"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium text-body">
                        {row.firstName} {row.lastName}
                      </p>
                      <p className="truncate font-mono text-sm text-subtle">{row.referenceCode}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-sm text-ink-600">
                      {BENEFICIARY_STATUS_LABELS[row.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default TopBarSearch;
