'use client';

import { useCallback, useState } from 'react';
import { HandCoins, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  DONATION_METHOD_LABELS,
  DONATION_STATUS_LABELS,
  listCampaigns,
  listDonations,
} from '@/api/fundraising.api';
import type { Campaign, CampaignStatus, DonationStatus } from '@/api/fundraising.api';
import { ReceiptsOwed } from './ReceiptsOwed';
import { describeCampaign, describeDonation } from './lib/giving';
import { PILLAR_LABELS } from '@/types/enums';
import { formatZAR } from '@/lib/money';
import { formatDate } from '@/lib/dates';

/*
 * Fundraising.
 *
 * ONLY SETTLED MONEY APPEARS IN A TOTAL. `raisedCents` is maintained by the server from
 * settled donations alone, and nothing here adds a pending gift to it. A bar that counts
 * a gateway's promise as income looks healthier than the bank account, and the gap is
 * invisible until someone tries to spend it.
 *
 * The receipts panel leads the page rather than sitting under the campaigns, because it is
 * the only thing here that is nobody's job by default — see the note in ReceiptsOwed.
 */

const STATUS_TONE: Record<CampaignStatus, string> = {
  DRAFT: 'bg-ink-100 text-ink-600',
  ACTIVE: 'bg-success-50 text-success-700',
  PAUSED: 'bg-accent-50 text-accent-800',
  COMPLETED: 'bg-brand-50 text-brand-700',
  CANCELLED: 'bg-danger-50 text-danger-700',
};

const DONATION_TONE: Record<DonationStatus, string> = {
  PENDING: 'text-accent-800',
  SETTLED: 'text-success-700',
  FAILED: 'text-danger-700',
  REFUNDED: 'text-muted',
};

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const standing = describeCampaign({
    raisedCents: campaign.raisedCents,
    targetCents: campaign.targetCents,
  });

  const { line, tone, fill } = (() => {
    switch (standing.kind) {
      case 'NO_TARGET':
        return {
          line: `${formatZAR(standing.raisedCents)} raised · no target set`,
          tone: 'text-muted',
          fill: 'bg-ink-300',
        };
      case 'RAISING':
        return {
          line: `${formatZAR(standing.remainingCents)} still needed`,
          tone: 'text-muted',
          fill: 'bg-brand-500',
        };
      case 'REACHED':
        return { line: 'Target reached', tone: 'text-success-700 font-semibold', fill: 'bg-success-500' };
      case 'EXCEEDED':
        return {
          line: `${formatZAR(standing.overCents)} past target`,
          tone: 'text-success-700 font-semibold',
          fill: 'bg-success-500',
        };
    }
  })();

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-body">{campaign.name}</h3>
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap',
                STATUS_TONE[campaign.status]
              )}
            >
              {CAMPAIGN_STATUS_LABELS[campaign.status]}
            </span>
          </div>
          {campaign.pillar && (
            <p className="mt-0.5 text-sm text-subtle">{PILLAR_LABELS[campaign.pillar]}</p>
          )}
        </div>

        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums text-body">
            {formatZAR(campaign.raisedCents)}
          </p>
          {standing.kind !== 'NO_TARGET' && (
            <p className="text-sm text-subtle">
              of {formatZAR(standing.targetCents)} · {standing.percent}%
            </p>
          )}
        </div>
      </div>

      {/* The width is clamped because a bar cannot overflow its track; the PERCENTAGE above
          is not, so a campaign that beat its target still says 140%. */}
      {standing.kind !== 'NO_TARGET' && (
        <div aria-hidden="true" className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink-100">
          <div
            className={cn('h-full rounded-full', fill)}
            style={{ width: `${Math.min(100, standing.percent)}%` }}
          />
        </div>
      )}

      <p className={cn('mt-2 text-sm', tone)}>
        {line}
        {campaign.endsAt && (
          <span className="text-subtle"> · closes {formatDate(campaign.endsAt)}</span>
        )}
      </p>
    </li>
  );
}

export function FundraisingOverview() {
  const { can } = useAuth();
  const mayReadDonations = can(PERMISSIONS.DONATION_READ);
  const [status, setStatus] = useState<CampaignStatus | ''>('');

  const campaigns = useApi(
    useCallback(
      (signal: AbortSignal) =>
        listCampaigns({ limit: 50, sort: '-raisedCents', ...(status ? { status } : {}) }, signal),
      [status]
    ),
    [status]
  );

  const recent = useApi(
    useCallback(
      (signal: AbortSignal) =>
        mayReadDonations
          ? listDonations({ limit: 10, sort: '-receivedAt' }, signal)
          : Promise.resolve(null),
      [mayReadDonations]
    ),
    [mayReadDonations]
  );

  const rows = campaigns.data?.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Fundraising</h1>
        <p className="mt-1 text-base text-muted">
          Campaigns, and the gifts that have actually cleared.
        </p>
      </header>

      {mayReadDonations && <ReceiptsOwed />}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-body">
            <Target className="size-4 text-subtle" aria-hidden="true" />
            Campaigns
            {campaigns.data && (
              <span className="font-normal text-subtle">({campaigns.data.meta.total})</span>
            )}
          </h2>

          <label className="flex items-center gap-2 text-base">
            <span className="sr-only">Filter by status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as CampaignStatus | '')}
              className="min-h-9 rounded-full border border-line bg-surface px-3.5 text-base text-body hover:border-line-strong"
            >
              <option value="">Every status</option>
              {CAMPAIGN_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {CAMPAIGN_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {campaigns.error && (
          <div className="mt-3 flex flex-col items-start gap-2">
            <ErrorAlert error={campaigns.error} />
            <Button variant="subtle" onClick={campaigns.reload}>
              Try again
            </Button>
          </div>
        )}

        {campaigns.loading && !campaigns.data && (
          <Spinner label="Loading campaigns" className="py-12" />
        )}

        {campaigns.data && rows.length === 0 && (
          <div className="mt-3 rounded-xl border border-line bg-surface px-6 py-12 text-center">
            <HandCoins className="mx-auto size-5 text-subtle" aria-hidden="true" />
            <p className="mt-2 text-base text-body">
              {status ? 'No campaigns match that status.' : 'No campaigns have been set up yet.'}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              A campaign totals only donations that have settled — a pending gift is a
              promise, not funds.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {rows.map((campaign) => (
              <CampaignCard key={campaign._id} campaign={campaign} />
            ))}
          </ul>
        )}
      </section>

      {mayReadDonations && recent.data && recent.data.data.length > 0 && (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-body">Recent gifts</h2>
          <ul className="mt-2 divide-y divide-line">
            {recent.data.data.map((donation) => {
              const standing = describeDonation({
                status: donation.status,
                receiptEmailedAt: donation.receiptEmailedAt,
              });
              return (
                <li key={donation._id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-base text-body">
                      <span className="font-semibold tabular-nums">
                        {formatZAR(donation.amountCents)}
                      </span>
                      <span className="ml-2 text-sm text-subtle">
                        {DONATION_METHOD_LABELS[donation.method]}
                      </span>
                    </p>
                    <p className="truncate font-mono text-sm text-subtle">{donation.reference}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className={cn('font-semibold', DONATION_TONE[donation.status])}>
                      {DONATION_STATUS_LABELS[donation.status]}
                    </p>
                    <p className="text-subtle">
                      {/* Named explicitly rather than left blank: "settled" and "the donor
                          has their certificate" are different facts. */}
                      {standing.kind === 'RECEIPT_OWED'
                        ? 'receipt not sent'
                        : formatDate(donation.receivedAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

export default FundraisingOverview;
