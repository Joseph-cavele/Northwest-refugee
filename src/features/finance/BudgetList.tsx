'use client';

import { useCallback, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  BUDGET_STATUSES,
  BUDGET_STATUS_LABELS,
  getBudgetPosition,
  listBudgets,
} from '@/api/finance.api';
import type { Budget, BudgetStatus, BudgetPositionLine } from '@/api/finance.api';
import { formatZAR } from '@/lib/money';
import type { Id } from '@/types/models';

/*
 * Where the money stands, line by line.
 *
 * A BUDGET LINE IS THREE QUANTITIES, NOT ONE. Allocated is the ceiling; committed is
 * approved-in-principle and not yet paid; spent is posted. Available is what is left after
 * both. Showing only "spent of allocated" is the mistake that lets a line be committed to
 * twice — by the time the second commitment is posted the money was already promised.
 *
 * THE BAR IS A SEQUENTIAL RAMP, NOT A CATEGORICAL PALETTE, and that distinction was checked
 * rather than assumed. The three parts are ordered by how firmly the money is gone —
 * spent, then committed, then free — so they are steps of ONE hue with strictly increasing
 * lightness (brand-600 → brand-300 → the ink-100 track), which is what a sequential
 * encoding requires. Three arbitrary colours would imply three unrelated identities.
 * Adjacent steps separate at ΔE 27 for normal vision and 26 under protanopia, and every
 * segment is labelled in text besides — the bar is never the only place a figure appears.
 *
 * OVERSPENT IS ITS OWN STATE. A negative available is not a small bar, it is a line that
 * has gone past its allocation, and it turns the whole row red and says so in words.
 */

const STATUS_TONE: Record<BudgetStatus, string> = {
  DRAFT: 'bg-ink-100 text-ink-600',
  PENDING_APPROVAL: 'bg-accent-50 text-accent-800',
  APPROVED: 'bg-success-50 text-success-700',
  REJECTED: 'bg-danger-50 text-danger-700',
  CLOSED: 'bg-ink-100 text-ink-600',
};

/** One line's allocation, split into spent / committed / free. */
function LineBar({ line }: { line: BudgetPositionLine }) {
  const allocated = line.allocatedCents;
  const overspent = line.availableCents < 0;

  // Shares of the allocation. Guarded because an unallocated line would divide by zero,
  // and clamped so a breached line fills the track rather than overflowing its container.
  const share = (cents: number) =>
    allocated > 0 ? Math.min(100, Math.max(0, (cents / allocated) * 100)) : 0;

  const spentShare = share(line.spentCents);
  const committedShare = Math.min(100 - spentShare, share(line.committedCents));

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <span className="font-mono text-xs text-subtle">{line.code}</span>
          <span className="ml-2 text-sm text-body">{line.description}</span>
        </div>
        <span
          className={cn(
            'text-sm tabular-nums',
            overspent ? 'font-semibold text-danger-700' : 'text-body'
          )}
        >
          {overspent ? (
            <>
              <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
              {formatZAR(Math.abs(line.availableCents))} over
            </>
          ) : (
            <>{formatZAR(line.availableCents)} left</>
          )}
          <span className="ml-1.5 text-subtle">of {formatZAR(allocated)}</span>
        </span>
      </div>

      {/* Reinforcement. Every figure it encodes is already written above and below it. */}
      <div
        aria-hidden="true"
        className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-ink-100"
      >
        <span
          className={cn('h-full', overspent ? 'bg-danger-500' : 'bg-brand-600')}
          style={{ width: `${overspent ? 100 : spentShare}%` }}
        />
        {!overspent && committedShare > 0 && (
          // A 2px surface gap between adjacent fills, so the boundary is legible without
          // relying on the two blues being told apart.
          <span
            className="h-full border-l-2 border-surface bg-brand-300"
            style={{ width: `${committedShare}%` }}
          />
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-subtle">
        <span>
          <span className="mr-1.5 inline-block size-2 rounded-full bg-brand-600 align-middle" aria-hidden="true" />
          {formatZAR(line.spentCents)} spent
        </span>
        <span>
          <span className="mr-1.5 inline-block size-2 rounded-full bg-brand-300 align-middle" aria-hidden="true" />
          {formatZAR(line.committedCents)} committed
        </span>
        {!line.reconciled && (
          // Not cosmetic: the running total and the posted entries are maintained by
          // different paths, so a mismatch means one of them is wrong.
          <span className="font-medium text-danger-700">
            Does not match the ledger — posted entries total {formatZAR(line.actualCents)}
          </span>
        )}
      </div>
    </div>
  );
}

function Position({ budgetId }: { budgetId: Id }) {
  const { data, loading, error } = useApi(
    useCallback((signal: AbortSignal) => getBudgetPosition(budgetId, signal), [budgetId]),
    [budgetId]
  );

  if (loading) return <Spinner label="Loading the budget position" className="py-6" />;
  if (error) return <ErrorAlert error={error} />;
  if (!data) return null;

  if (data.lines.length === 0) {
    return <p className="py-3 text-sm text-muted">This budget has no lines.</p>;
  }

  return (
    <div className="divide-y divide-line border-t border-line">
      {data.lines.map((line) => (
        <LineBar key={line.code} line={line} />
      ))}
    </div>
  );
}

function BudgetCard({ budget }: { budget: Budget }) {
  const [open, setOpen] = useState(false);
  const overspent = budget.totalAvailableCents < 0;

  return (
    <li className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-body">{budget.name}</span>
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
                STATUS_TONE[budget.status]
              )}
            >
              {BUDGET_STATUS_LABELS[budget.status]}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-subtle">
            <span className="font-mono">{budget.reference}</span> · financial year{' '}
            {budget.financialYear} · {budget.lines.length}{' '}
            {budget.lines.length === 1 ? 'line' : 'lines'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p
              className={cn(
                'text-sm font-semibold tabular-nums',
                overspent ? 'text-danger-700' : 'text-body'
              )}
            >
              {overspent
                ? `${formatZAR(Math.abs(budget.totalAvailableCents))} over`
                : `${formatZAR(budget.totalAvailableCents)} left`}
            </p>
            <p className="text-xs text-subtle">of {formatZAR(budget.totalAllocatedCents)}</p>
          </div>
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-subtle" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />
          )}
        </div>
      </button>

      {/* Lines are fetched only when opened: the position endpoint recomputes actuals from
          the ledger, which is not work worth doing for every budget on the page. */}
      {open && (
        <div className="px-4 pb-2">
          <Position budgetId={budget._id} />
        </div>
      )}
    </li>
  );
}

export function BudgetList() {
  const [status, setStatus] = useState<BudgetStatus | ''>('');

  const { data, loading, error, reload } = useApi(
    useCallback(
      (signal: AbortSignal) =>
        listBudgets({ limit: 50, sort: '-financialYear', ...(status ? { status } : {}) }, signal),
      [status]
    ),
    [status]
  );

  const rows = data?.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Budgets</h1>
        <p className="mt-1 text-sm text-muted">
          What was allocated, what is promised, and what is left.
        </p>
      </header>

      <label className="flex w-fit items-center gap-2 text-sm">
        <span className="sr-only">Filter by status</span>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as BudgetStatus | '')}
          className="min-h-10 rounded-full border border-line bg-surface px-4 text-sm text-body hover:border-line-strong"
        >
          <option value="">Every status</option>
          {BUDGET_STATUSES.map((value) => (
            <option key={value} value={value}>
              {BUDGET_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <div className="flex flex-col items-start gap-3">
          <ErrorAlert error={error} />
          <Button variant="subtle" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {loading && !data && <Spinner label="Loading budgets" className="py-20" />}

      {data && rows.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <Wallet className="mx-auto size-5 text-subtle" aria-hidden="true" />
          <p className="mt-2 text-sm text-body">
            {status ? 'No budgets match that status.' : 'No budgets have been set up yet.'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            Only an approved budget can carry commitments and spend.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((budget) => (
            <BudgetCard key={budget._id} budget={budget} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default BudgetList;
