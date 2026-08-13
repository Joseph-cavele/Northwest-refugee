'use client';

import { useCallback, useState } from 'react';
import { MailWarning, Send } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { useSubmit } from '@/hooks/useSubmit';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { listDonations, resendReceipt } from '@/api/fundraising.api';
import type { Donation } from '@/api/fundraising.api';
import { describeDonation } from './lib/giving';
import { formatZAR } from '@/lib/money';
import { formatDate } from '@/lib/dates';

/*
 * Donors who are owed an s18A tax certificate.
 *
 * WHY THIS IS THE FIRST THING ON THE PAGE. Settling a donation does not send its receipt.
 * The send is deliberately best-effort — a mail provider outage must not undo banked money
 * or roll back a campaign total — so the outcome is recorded on the donation rather than
 * thrown, and `receiptEmailedAt` is what answers "did the donor actually get it?".
 *
 * Which means every failure is silent. Nothing anywhere reports it, the donation looks
 * perfectly healthy in the ledger, and the donor discovers it the following February when
 * they try to claim the deduction. A tax certificate NWHR was legally able to issue and
 * simply never delivered is a poor way to treat someone who gave money.
 *
 * There is no server-side filter for this — the list endpoint has no "unreceipted" flag —
 * so a page of settled donations is fetched and narrowed here. That is honest for the
 * volumes involved and is noted below so nobody mistakes it for a complete audit.
 */

const SCAN_LIMIT = 100;

export function ReceiptsOwed() {
  const [resent, setResent] = useState<Set<string>>(new Set());

  const { data, loading, error, reload } = useApi(
    useCallback(
      (signal: AbortSignal) =>
        listDonations({ status: 'SETTLED', limit: SCAN_LIMIT, sort: '-receivedAt' }, signal),
      []
    ),
    []
  );

  if (loading) return <Spinner label="Checking receipts" className="py-8" />;
  if (error) return <ErrorAlert error={error} />;
  if (!data) return null;

  const owed = data.data.filter(
    (donation) =>
      describeDonation({
        status: donation.status,
        receiptEmailedAt: donation.receiptEmailedAt,
      }).kind === 'RECEIPT_OWED' && !resent.has(donation._id)
  );

  if (owed.length === 0) {
    return (
      <Alert tone="success">
        Every settled donation in the last {data.data.length} has its tax certificate
        delivered.
      </Alert>
    );
  }

  return (
    <section className="rounded-xl border border-accent-200 bg-accent-50/40 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-body">
        <MailWarning className="size-4 text-accent-700" aria-hidden="true" />
        {owed.length} {owed.length === 1 ? 'donor is' : 'donors are'} owed a tax certificate
      </h2>
      <p className="mt-1 max-w-prose text-sm text-muted">
        These gifts are banked and their receipt numbers issued, but the email never reached
        the donor. They cannot claim the deduction until it does.
      </p>

      <ul className="mt-3 divide-y divide-accent-200/60">
        {owed.map((donation) => (
          <OwedRow
            key={donation._id}
            donation={donation}
            onSent={() => setResent((prev) => new Set(prev).add(donation._id))}
            onReload={reload}
          />
        ))}
      </ul>

      {data.meta.total > data.data.length && (
        // Said plainly. The endpoint has no unreceipted filter, so this is the most recent
        // page rather than every settled donation ever taken.
        <p className="mt-3 text-xs text-subtle">
          Checked the {data.data.length} most recent settled donations of {data.meta.total}.
        </p>
      )}
    </section>
  );
}

function OwedRow({
  donation,
  onSent,
  onReload,
}: {
  donation: Donation;
  onSent: () => void;
  onReload: () => void;
}) {
  const { submit, busy, error } = useSubmit(resendReceipt, {
    onSuccess: () => {
      onSent();
      onReload();
    },
  });

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-body">
          <span className="font-semibold tabular-nums">{formatZAR(donation.amountCents)}</span>
          <span className="ml-2 text-muted">
            settled {formatDate(donation.settledAt ?? donation.receivedAt)}
          </span>
        </p>
        <p className="truncate font-mono text-xs text-subtle">
          {donation.reference}
          {donation.receiptNumber && ` · ${donation.receiptNumber}`}
        </p>
        {error && (
          <p className="mt-1 text-xs text-danger-700">
            {/* A resend can fail the same way the first send did — most often because the
                donor has no email address on file, which resending will never fix. */}
            {error.message}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => void submit(donation._id)}
        disabled={busy}
        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-xs font-semibold text-body hover:border-line-strong disabled:text-ink-400"
      >
        <Send className="size-3.5" aria-hidden="true" />
        {busy ? 'Sending…' : 'Send again'}
      </button>
    </li>
  );
}

export default ReceiptsOwed;
