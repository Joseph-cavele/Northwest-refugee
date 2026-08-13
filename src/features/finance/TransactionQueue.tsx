'use client';

import { useCallback, useState } from 'react';
import { Check, Inbox, Lock, RotateCcw, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useSubmit } from '@/hooks/useSubmit';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Pager } from '@/components/ui/pager';
import { Spinner } from '@/components/ui/spinner';
import {
  TRANSACTION_STATUSES,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  approveTransaction,
  listTransactions,
  rejectTransaction,
  reverseTransaction,
} from '@/api/finance.api';
import type {
  ListTransactionsQuery,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '@/api/finance.api';
import { describeApproval } from './lib/approval';
import { formatZAR } from '@/lib/money';
import { formatDate } from '@/lib/dates';
import { formatCount } from '@/lib/format';

/*
 * The ledger, and the queue of things waiting on a second pair of eyes.
 *
 * THIS SCREEN'S JOB IS TO MAKE SEGREGATION OF DUTIES LEGIBLE. Two controls decide whether
 * a given person may approve a given transaction, and neither is a permission:
 *
 *   - the creator can never approve their own, whatever their role
 *   - an approver may only approve up to their delegated ceiling
 *
 * Both are enforced in finance.service.js and both are PREDICTED here, so a row says "you
 * raised this one" or "R6 000 is above your R5 000 limit — the Executive Director approves
 * this" instead of offering a button that returns 403. On a screen whose entire purpose is
 * that two people are involved, a control that looks available and is not teaches people
 * the system is unreliable — and the next thing they do is stop reading it.
 *
 * POSTED ENTRIES ARE NEVER EDITABLE. The model refuses it at save time. The correction is a
 * reversal, which writes a matching opposing entry and leaves the original exactly as it
 * was — so the only action offered on a posted row is Reverse, and it asks for a reason
 * because the reason is what the ledger keeps.
 */

const PAGE_SIZE = 25;

const STATUS_TONE: Record<TransactionStatus, string> = {
  DRAFT: 'bg-ink-100 text-ink-600',
  PENDING_APPROVAL: 'bg-accent-50 text-accent-800',
  APPROVED: 'bg-success-50 text-success-700',
  REJECTED: 'bg-danger-50 text-danger-700',
  REVERSED: 'bg-ink-100 text-ink-600',
};

/** Why this row is or is not yours to approve. Never a bare disabled button. */
function ApprovalCell({
  row,
  onDecide,
}: {
  row: Transaction;
  onDecide: (row: Transaction, decision: 'approve' | 'reject') => void;
}) {
  const { user, can } = useAuth();

  const standing = describeApproval({
    status: row.status,
    createdBy: row.createdBy,
    amountCents: row.amountCents,
    actorId: user?._id ?? null,
    actorRole: user?.role,
    hasApprovePermission: can(PERMISSIONS.TRANSACTION_APPROVE),
  });

  switch (standing.kind) {
    case 'CAN_APPROVE':
      return (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => onDecide(row, 'reject')}
            className="min-h-9 rounded-full border border-line px-3 text-xs font-semibold text-body hover:border-line-strong hover:bg-ink-50"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => onDecide(row, 'approve')}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-500 px-3.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            <Check className="size-3.5" aria-hidden="true" />
            Approve
          </button>
        </div>
      );

    case 'OWN_RECORD':
      return (
        // Named as the control it is, not as a failure. Maker-checker working correctly is
        // the system doing its job, and the wording should not read like an error.
        <span className="inline-flex items-center justify-end gap-1.5 text-xs text-muted">
          <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
          You raised this — someone else approves it
        </span>
      );

    case 'ABOVE_CEILING':
      return (
        <span className="inline-flex items-center justify-end gap-1.5 text-xs text-accent-800">
          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          Above your {formatZAR(standing.ceilingCents)} limit — the Executive Director
          approves this
        </span>
      );

    case 'NO_AUTHORITY':
      return (
        <span className="text-xs text-subtle">Your role does not approve spend</span>
      );

    case 'NO_PERMISSION':
    case 'NOT_PENDING':
      return null;
  }
}

export function TransactionQueue() {
  const { can } = useAuth();
  const mayApprove = can(PERMISSIONS.TRANSACTION_APPROVE);

  const [awaitingOnly, setAwaitingOnly] = useState(true);
  const [type, setType] = useState<TransactionType | ''>('');
  const [status, setStatus] = useState<TransactionStatus | ''>('');
  const [page, setPage] = useState(1);

  const [decision, setDecision] = useState<{
    row: Transaction;
    kind: 'approve' | 'reject' | 'reverse';
  } | null>(null);

  const { data, loading, error, reload } = useApi(
    useCallback(
      (signal: AbortSignal) => {
        const query: ListTransactionsQuery = {
          page,
          limit: PAGE_SIZE,
          ...(awaitingOnly ? { awaitingApproval: true } : {}),
          ...(type ? { type } : {}),
          ...(status && !awaitingOnly ? { status } : {}),
        };
        return listTransactions(query, signal);
      },
      [page, awaitingOnly, type, status]
    ),
    [page, awaitingOnly, type, status]
  );

  function refilter(change: () => void) {
    change();
    setPage(1);
  }

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Finance</h1>
        <p className="mt-1 text-sm text-muted">
          {meta
            ? awaitingOnly
              ? `${formatCount(meta.total)} ${meta.total === 1 ? 'transaction' : 'transactions'} awaiting approval`
              : `${formatCount(meta.total)} ${meta.total === 1 ? 'transaction' : 'transactions'}`
            : 'Every movement of money, and what is waiting on a second signature.'}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={awaitingOnly}
          onClick={() => refilter(() => setAwaitingOnly((v) => !v))}
          className={cn(
            'inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
            awaitingOnly
              ? 'border-brand-500 bg-brand-500 text-white'
              : 'border-line bg-surface text-body hover:border-line-strong'
          )}
        >
          <Inbox className="size-4" aria-hidden="true" />
          Awaiting approval
        </button>

        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Filter by type</span>
          <select
            value={type}
            onChange={(event) => refilter(() => setType(event.target.value as TransactionType | ''))}
            className="min-h-10 rounded-full border border-line bg-surface px-4 text-sm text-body hover:border-line-strong"
          >
            <option value="">Every type</option>
            {TRANSACTION_TYPES.map((value) => (
              <option key={value} value={value}>
                {TRANSACTION_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Filter by status</span>
          <select
            value={status}
            onChange={(event) =>
              refilter(() => setStatus(event.target.value as TransactionStatus | ''))
            }
            // "Awaiting approval" IS a status filter; offering a second one beside it
            // would guarantee an empty list on every choice but one.
            disabled={awaitingOnly}
            className="min-h-10 rounded-full border border-line bg-surface px-4 text-sm text-body hover:border-line-strong disabled:text-ink-400"
          >
            <option value="">Every status</option>
            {TRANSACTION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {TRANSACTION_STATUS_LABELS[value]}
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

      {loading && !data && <Spinner label="Loading transactions" className="py-20" />}

      {data && rows.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-sm text-body">
            {awaitingOnly
              ? 'Nothing is waiting for approval.'
              : 'No transactions match those filters.'}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted">
            A transaction is raised by one person and approved by another. Approving posts it
            to the ledger, after which it can only be corrected by a reversal.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row._id}
              className="rounded-xl border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* The figure is the point of the row, so it leads and it is exact —
                        never compacted. Someone signing off needs the real number. */}
                    <span className="text-lg font-semibold tabular-nums text-body">
                      {formatZAR(row.amountCents)}
                    </span>
                    <span className="text-xs text-subtle">
                      {TRANSACTION_TYPE_LABELS[row.type]}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
                        STATUS_TONE[row.status]
                      )}
                    >
                      {TRANSACTION_STATUS_LABELS[row.status]}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-body">{row.description}</p>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                    <span className="font-mono">{row.reference}</span>
                    {row.payee && <span>to {row.payee}</span>}
                    <span>{PAYMENT_METHOD_LABELS[row.method]}</span>
                    {row.budgetLineCode && <span>line {row.budgetLineCode}</span>}
                    <span>raised {formatDate(row.createdAt)}</span>
                  </div>

                  {row.status === 'REJECTED' && row.rejectionReason && (
                    <p className="mt-1.5 text-xs text-danger-700">
                      Rejected — {row.rejectionReason}
                    </p>
                  )}
                  {row.status === 'REVERSED' && (
                    <p className="mt-1.5 text-xs text-muted">
                      Reversed{row.reversalReason ? ` — ${row.reversalReason}` : ''}. The
                      original entry stands; the correction is a matching opposing entry.
                    </p>
                  )}
                  {row.reversalOf && (
                    <p className="mt-1.5 text-xs text-muted">
                      This entry is itself a correction of an earlier one.
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2 sm:w-72">
                  <ApprovalCell
                    row={row}
                    onDecide={(target, kind) => setDecision({ row: target, kind })}
                  />

                  {/*
                    * The only action a posted entry gets. Editing one is refused at the
                    * model layer, so a correction is a new opposing row and this is how it
                    * is raised. A reversal is not offered twice.
                    */}
                  {mayApprove && row.status === 'APPROVED' && (
                    <button
                      type="button"
                      onClick={() => setDecision({ row, kind: 'reverse' })}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold text-body hover:border-line-strong hover:bg-ink-50"
                    >
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                      Reverse
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {meta && <Pager meta={meta} onPage={setPage} label="Transaction pages" />}

      {decision && (
        <DecisionDialog
          row={decision.row}
          kind={decision.kind}
          onClose={() => setDecision(null)}
          onDone={reload}
        />
      )}
    </div>
  );
}

// --- the decision ----------------------------------------------------------------------

function DecisionDialog({
  row,
  kind,
  onClose,
  onDone,
}: {
  row: Transaction;
  kind: 'approve' | 'reject' | 'reverse';
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');

  const { submit, busy, error, fieldErrors } = useSubmit(
    async () => {
      if (kind === 'approve') return approveTransaction(row._id);
      if (kind === 'reject') return rejectTransaction(row._id, reason.trim());
      return reverseTransaction(row._id, reason.trim());
    },
    {
      onSuccess: () => {
        onDone();
        onClose();
      },
    }
  );

  // The server requires a reason on both of these; mirrored so it is asked for while the
  // person is still thinking about it rather than bounced back after they commit.
  const needsReason = kind !== 'approve';
  const blocked = needsReason && reason.trim().length === 0;

  const title =
    kind === 'approve'
      ? 'Approve and post?'
      : kind === 'reject'
        ? 'Reject this transaction?'
        : 'Reverse this posted entry?';

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={title}
      footer={
        <>
          <Button variant="subtle" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={blocked} onClick={() => void submit()}>
            {kind === 'approve' ? 'Approve' : kind === 'reject' ? 'Reject' : 'Reverse'}
          </Button>
        </>
      }
    >
      {error && (
        <ErrorAlert error={error}>
          {error.code === 'SELF_APPROVAL' &&
            // The one error worth explaining rather than just showing: it is a control
            // doing its job, not a fault to be reported to anyone.
            'A transaction must be approved by someone other than the person who raised it.'}
        </ErrorAlert>
      )}

      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-line bg-sunken px-3 py-2.5">
          <p className="text-lg font-semibold tabular-nums text-body">
            {formatZAR(row.amountCents)}
          </p>
          <p className="text-sm text-body">{row.description}</p>
          <p className="mt-0.5 font-mono text-xs text-subtle">{row.reference}</p>
        </div>

        {kind === 'approve' && (
          <Alert tone="info">
            Approving posts this to the ledger. It cannot be edited afterwards — a mistake is
            corrected by a reversal, which leaves both entries on the record.
          </Alert>
        )}

        {kind === 'reverse' && (
          <Alert tone="info">
            This writes a matching opposing entry and returns the money to its budget line.
            The original stays exactly as it was posted; the pair is the correction.
          </Alert>
        )}

        {needsReason && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-body">Reason</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder={
                kind === 'reject'
                  ? 'What is wrong with it? The person who raised it reads this.'
                  : 'What was wrong with the original? This stays on the ledger.'
              }
              disabled={busy}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400"
            />
            {fieldErrors.reason && (
              <span className="text-xs text-danger-700">{fieldErrors.reason}</span>
            )}
          </label>
        )}
      </div>
    </Modal>
  );
}

export default TransactionQueue;
