import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { readDonationReceipt } from '@/server/modules/payments/checkout.service';
import { connectDB } from '@/server/config/db';
import { formatRandsWhole } from '@/lib/money';
import { formatDateTime } from '@/lib/dates';
import { ORG } from '@/lib/site';

/*
 * The receipt on /donate/success.
 *
 * A SERVER COMPONENT THAT READS THE SERVICE DIRECTLY rather than fetching its own API. There is
 * no round trip to make: this renders on the same server that owns the database, and going out
 * through /api/v1 would add a network hop, a second connection and an unauthenticated request
 * carrying the reference through one more log. `readDonationReceipt` already returns the narrow,
 * public-safe shape — no donor id, no email, no provider reference — so the boundary is kept by
 * the service, not by the transport.
 *
 * THREE STATES, AND ONLY ONE OF THEM SAYS THANK YOU:
 *
 *   SETTLED   the webhook verified it with the gateway and the amount matched. A receipt.
 *   PENDING   authorised, notification not yet arrived. Normal for a few seconds, and said
 *             plainly rather than dressed up as success.
 *   anything  failed, cancelled, or a reference that does not exist. No money moved, and the
 *   else      page says what to do next instead of leaving somebody guessing.
 *
 * NOTHING HERE MARKS ANYTHING. This component has no writes at all — a donor refreshing it a
 * hundred times settles nothing, which is the property that makes a public reference-keyed page
 * safe to have.
 */

export async function DonationReceiptPanel({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const { reference } = await searchParams;

  if (!reference) return <NotFound />;

  await connectDB();

  let receipt;
  try {
    receipt = await readDonationReceipt(reference);
  } catch {
    // A reference that matches nothing is indistinguishable from one that never existed, and
    // both get the same answer — which is also what stops this page confirming which
    // references are real.
    return <NotFound />;
  }

  if (receipt.status === 'SETTLED') {
    return (
      <div className="rounded-3xl bg-surface p-8 text-center sm:p-12">
        <span
          aria-hidden="true"
          className="mx-auto grid size-16 place-items-center rounded-full bg-brand-500 text-white"
        >
          <CheckCircle2 className="size-9" strokeWidth={2} />
        </span>

        <h1 className="mt-6 text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-extrabold tracking-[-0.02em] text-ink-950">
          Thank you for your support!
        </h1>

        <p className="mt-4 text-base leading-7 text-muted">
          {receipt.donorName ? `Thank you, ${receipt.donorName}. ` : 'Thank you. '}
          Your gift goes to permits, school placements, training and emergency support for
          refugees and asylum seekers in {ORG.city}.
        </p>

        {/*
         * A description list, because a receipt is labelled facts. The reference is the one a
         * donor quotes at the desk, so it is set larger and in a tabular figure.
         */}
        <dl className="mt-8 divide-y divide-line rounded-2xl bg-ink-50 text-left">
          <Row label="Amount" value={formatRandsWhole(receipt.amountCents)} emphasis />
          {receipt.donorName && <Row label="Donor" value={receipt.donorName} />}
          <Row label="Reference" value={receipt.reference} emphasis />
          <Row
            label="Date"
            value={formatDateTime(receipt.settledAt ?? receipt.createdAt)}
          />
          {receipt.receiptNumber && (
            <Row label="Tax certificate" value={receipt.receiptNumber} />
          )}
        </dl>

        <p className="mt-6 text-sm leading-6 text-muted">
          Keep this reference. A confirmation is on its way to the email address you gave.
        </p>
      </div>
    );
  }

  if (receipt.status === 'PENDING') {
    return (
      <div className="rounded-3xl bg-surface p-8 text-center sm:p-12">
        <span
          aria-hidden="true"
          className="mx-auto grid size-16 place-items-center rounded-full bg-gold-100 text-gold-700"
        >
          <Clock className="size-9" strokeWidth={2} />
        </span>

        <h1 className="mt-6 text-[clamp(1.5rem,3.5vw,2rem)] leading-tight font-extrabold tracking-[-0.02em] text-ink-950">
          We are waiting for confirmation
        </h1>

        <p className="mt-4 text-base leading-7 text-muted">
          Your payment has been authorised but the confirmation has not reached us yet. This
          usually takes a few seconds — refresh this page in a moment.
        </p>

        <dl className="mt-8 divide-y divide-line rounded-2xl bg-ink-50 text-left">
          <Row label="Amount" value={formatRandsWhole(receipt.amountCents)} emphasis />
          <Row label="Reference" value={receipt.reference} emphasis />
        </dl>

        <p className="mt-6 text-sm leading-6 text-muted">
          If it has not confirmed within an hour, ring{' '}
          <a href={ORG.phoneHref} className="font-semibold text-brand-600 underline">
            {ORG.phone}
          </a>{' '}
          and quote that reference — no money will have been taken twice.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-surface p-8 text-center sm:p-12">
      <span
        aria-hidden="true"
        className="mx-auto grid size-16 place-items-center rounded-full bg-danger-50 text-danger-700"
      >
        <AlertTriangle className="size-9" strokeWidth={2} />
      </span>

      <h1 className="mt-6 text-[clamp(1.5rem,3.5vw,2rem)] leading-tight font-extrabold tracking-[-0.02em] text-ink-950">
        This donation did not go through
      </h1>

      <p className="mt-4 text-base leading-7 text-muted">
        No money has been taken. You are welcome to try again, or ring{' '}
        <a href={ORG.phoneHref} className="font-semibold text-brand-600 underline">
          {ORG.phone}
        </a>{' '}
        and we will arrange it another way.
      </p>
    </div>
  );
}

function NotFound() {
  return (
    <div className="rounded-3xl bg-surface p-8 text-center sm:p-12">
      <h1 className="text-[clamp(1.5rem,3.5vw,2rem)] leading-tight font-extrabold tracking-[-0.02em] text-ink-950">
        We could not find that donation
      </h1>
      <p className="mt-4 text-base leading-7 text-muted">
        The link may be incomplete. If you have just given and this looks wrong, ring{' '}
        <a href={ORG.phoneHref} className="font-semibold text-brand-600 underline">
          {ORG.phone}
        </a>{' '}
        — no money will have been taken twice.
      </p>
    </div>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 px-6 py-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={
          emphasis
            ? 'text-base font-extrabold tracking-[0.02em] text-ink-950 tabular-nums'
            : 'text-sm font-semibold text-body'
        }
      >
        {value}
      </dd>
    </div>
  );
}

export default DonationReceiptPanel;
