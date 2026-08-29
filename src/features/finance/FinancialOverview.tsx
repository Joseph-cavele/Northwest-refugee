'use client';

import { useCallback } from 'react';
import { Download, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  TRANSACTION_STATUS_LABELS,
  getBudgetPosition,
  listBudgets,
  listTransactions,
} from '@/api/finance.api';
import type { BudgetPosition, Transaction, TransactionStatus } from '@/api/finance.api';
import { listCampaigns, listDonations } from '@/api/fundraising.api';
import type { Campaign, Donation } from '@/api/fundraising.api';
import { describeCampaign, countsTowardsTotals } from '@/features/fundraising/lib/giving';
import { csvAmount, downloadFile, toCsv } from '@/lib/csv';
import { formatZAR } from '@/lib/money';
import { formatDate } from '@/lib/dates';
import { ORG } from '@/lib/site';

/*
 * Where the money stands, on one page, in a form somebody can take away.
 *
 * THE FIGURES ARE THE SAME ONES THE SCREENS SHOW, AND FOR THE SAME REASONS. Spend counts
 * posted transactions; a pending approval is a commitment, not spend. Income counts settled
 * donations only, because a pending gift is a gateway's promise rather than funds. An overview
 * that quietly used different rules from the pages it summarises would be worse than none
 * at all — it is the version that leaves the building.
 *
 * TWO WAYS OUT, because they answer different questions:
 *
 *   CSV     for a finance officer, who wants to total a column. Amounts leave as plain
 *           decimals rather than "R 1 234,56", and every text cell is neutralised against
 *           formula injection — see lib/csv.ts.
 *   PRINT   for a board pack or a funder, who wants a document. The browser's own
 *           print-to-PDF, with a stylesheet that drops the chrome. No PDF library, which
 *           would be a large dependency for a page that already lays out correctly.
 */

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0',
        strong && 'font-semibold'
      )}
    >
      <span className={strong ? 'text-body' : 'text-muted'}>{label}</span>
      <span className="tabular-nums text-body">{value}</span>
    </div>
  );
}

export function FinancialOverview() {
  const { can } = useAuth();
  const mayReadDonations = can(PERMISSIONS.DONATION_READ);
  const mayReadBudgets = can(PERMISSIONS.BUDGET_READ);

  const budgets = useApi(
    useCallback(
      (signal: AbortSignal) =>
        mayReadBudgets ? listBudgets({ limit: 1, sort: '-financialYear' }, signal) : Promise.resolve(null),
      [mayReadBudgets]
    ),
    [mayReadBudgets]
  );

  const budgetId = budgets.data?.data[0]?._id ?? null;

  const position = useApi(
    useCallback(
      (signal: AbortSignal) =>
        budgetId ? getBudgetPosition(budgetId, signal) : Promise.resolve(null),
      [budgetId]
    ),
    [budgetId]
  );

  const transactions = useApi(
    useCallback((signal: AbortSignal) => listTransactions({ limit: 100 }, signal), []),
    []
  );

  const campaigns = useApi(
    useCallback(
      (signal: AbortSignal) =>
        mayReadDonations ? listCampaigns({ limit: 50 }, signal) : Promise.resolve(null),
      [mayReadDonations]
    ),
    [mayReadDonations]
  );

  const donations = useApi(
    useCallback(
      (signal: AbortSignal) =>
        mayReadDonations ? listDonations({ limit: 100 }, signal) : Promise.resolve(null),
      [mayReadDonations]
    ),
    [mayReadDonations]
  );

  const loading = budgets.loading || transactions.loading;
  const error = budgets.error ?? transactions.error ?? position.error;

  if (loading) return <Spinner label="Building the overview" className="py-24" />;

  const pos: BudgetPosition | null = position.data ?? null;
  const txns: Transaction[] = transactions.data?.data ?? [];
  const camps: Campaign[] = campaigns.data?.data ?? [];
  const gifts: Donation[] = donations.data?.data ?? [];

  // Counted here the way every screen counts them, so the overview cannot disagree with the
  // pages it summarises.
  const byStatus = txns.reduce<Record<string, { count: number; cents: number }>>((acc, t) => {
    const bucket = acc[t.status] ?? { count: 0, cents: 0 };
    return { ...acc, [t.status]: { count: bucket.count + 1, cents: bucket.cents + t.amountCents } };
  }, {});

  const settledGifts = gifts.filter((g) => countsTowardsTotals(g.status));
  const settledCents = settledGifts.reduce((total, g) => total + g.amountCents, 0);
  const pendingGifts = gifts.filter((g) => g.status === 'PENDING');
  const pendingCents = pendingGifts.reduce((total, g) => total + g.amountCents, 0);

  function exportCsv() {
    const rows: (string | number | null)[][] = [
      [`${ORG.shortName} — financial overview`],
      ['Generated', formatDate(new Date().toISOString())],
      ['Amounts in', 'ZAR'],
      [],
    ];

    if (pos) {
      rows.push(['Budget position', pos.reference]);
      rows.push(['Line', 'Description', 'Allocated', 'Committed', 'Spent', 'Available', 'Agrees with ledger']);
      for (const line of pos.lines) {
        rows.push([
          line.code,
          line.description,
          csvAmount(line.allocatedCents),
          csvAmount(line.committedCents),
          csvAmount(line.spentCents),
          csvAmount(line.availableCents),
          line.reconciled ? 'yes' : 'NO',
        ]);
      }
      rows.push([
        'Total',
        '',
        csvAmount(pos.totalAllocatedCents),
        csvAmount(pos.totalCommittedCents),
        csvAmount(pos.totalSpentCents),
        csvAmount(pos.totalAvailableCents),
        '',
      ]);
      rows.push([]);
    }

    rows.push(['Transactions by status', 'Count', 'Value']);
    for (const [status, bucket] of Object.entries(byStatus)) {
      rows.push([
        TRANSACTION_STATUS_LABELS[status as TransactionStatus] ?? status,
        bucket.count,
        csvAmount(bucket.cents),
      ]);
    }
    rows.push([]);

    if (mayReadDonations) {
      rows.push(['Fundraising']);
      rows.push(['Campaign', 'Target', 'Raised (settled only)', 'Percent']);
      for (const campaign of camps) {
        const standing = describeCampaign({
          raisedCents: campaign.raisedCents,
          targetCents: campaign.targetCents,
        });
        rows.push([
          campaign.name,
          standing.kind === 'NO_TARGET' ? '' : csvAmount(standing.targetCents),
          csvAmount(campaign.raisedCents),
          standing.kind === 'NO_TARGET' ? '' : `${standing.percent}%`,
        ]);
      }
      rows.push([]);
      rows.push(['Donations settled', settledGifts.length, csvAmount(settledCents)]);
      // Reported separately and never added in — the distinction the whole module turns on.
      rows.push(['Donations pending (not counted as income)', pendingGifts.length, csvAmount(pendingCents)]);
    }

    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`nwhr-financial-overview-${stamp}.csv`, toCsv(rows));
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Financial overview</h1>
          <p className="mt-1 max-w-prose text-base text-muted">
            Budget position, the ledger by status, and fundraising — counted the same way the
            screens count them. Generated {formatDate(new Date().toISOString())}.
          </p>
        </div>

        <div className="no-print flex flex-wrap gap-2">
          <Button variant="subtle" className="px-4 py-2" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden="true" />
            Print or save as PDF
          </Button>
          <Button className="px-4 py-2" onClick={exportCsv}>
            <Download className="size-4" aria-hidden="true" />
            Download CSV
          </Button>
        </div>
      </header>

      {error && <ErrorAlert error={error} />}

      <Alert tone="info">
        Spend counts posted transactions only; a pending approval is a commitment, not spend.
        Income counts settled donations only — a pending gift is a promise, not funds.
      </Alert>

      {pos && (
        <section className="sheet rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-body">
            Budget position <span className="font-normal text-subtle">{pos.reference}</span>
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-base">
              <thead>
                <tr className="border-b border-line text-left">
                  {['Line', 'Allocated', 'Committed', 'Spent', 'Available'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-3 py-2 text-xs font-semibold tracking-[0.08em] text-subtle uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pos.lines.map((line) => (
                  <tr key={line.code} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-mono text-sm text-subtle">{line.code}</span>
                      <span className="ml-2 text-body">{line.description}</span>
                      {!line.reconciled && (
                        <span className="ml-2 text-sm font-medium text-danger-700">
                          does not agree with the ledger
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted">{formatZAR(line.allocatedCents)}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">{formatZAR(line.committedCents)}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">{formatZAR(line.spentCents)}</td>
                    <td
                      className={cn(
                        'px-3 py-2 tabular-nums',
                        line.availableCents < 0 ? 'font-semibold text-danger-700' : 'text-body'
                      )}
                    >
                      {formatZAR(line.availableCents)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-3 py-2 text-body">Total</td>
                  <td className="px-3 py-2 tabular-nums">{formatZAR(pos.totalAllocatedCents)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatZAR(pos.totalCommittedCents)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatZAR(pos.totalSpentCents)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatZAR(pos.totalAvailableCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="sheet rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-body">Transactions by status</h2>
        <dl className="mt-2">
          {Object.entries(byStatus).map(([status, bucket]) => (
            <Row
              key={status}
              label={`${TRANSACTION_STATUS_LABELS[status as TransactionStatus] ?? status} · ${bucket.count}`}
              value={formatZAR(bucket.cents)}
            />
          ))}
          {Object.keys(byStatus).length === 0 && (
            <p className="py-2 text-base text-muted">No transactions recorded.</p>
          )}
        </dl>
      </section>

      {mayReadDonations && (
        <section className="sheet rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-body">Fundraising</h2>
          <dl className="mt-2">
            {camps.map((campaign) => {
              const standing = describeCampaign({
                raisedCents: campaign.raisedCents,
                targetCents: campaign.targetCents,
              });
              return (
                <Row
                  key={campaign._id}
                  label={
                    standing.kind === 'NO_TARGET'
                      ? `${campaign.name} · no target`
                      : `${campaign.name} · ${standing.percent}% of ${formatZAR(standing.targetCents)}`
                  }
                  value={formatZAR(campaign.raisedCents)}
                />
              );
            })}
            <Row label={`Settled donations · ${settledGifts.length}`} value={formatZAR(settledCents)} strong />
            {/* Shown, never added in. Naming it is what stops somebody totalling the two. */}
            <Row
              label={`Pending · ${pendingGifts.length} · not counted as income`}
              value={formatZAR(pendingCents)}
            />
          </dl>
        </section>
      )}

      <p className="text-sm text-subtle">
        {ORG.shortName} · figures as at {formatDate(new Date().toISOString())}. Amounts in
        rands. This overview is generated from the live records and is not an audited statement.
      </p>
    </div>
  );
}

export default FinancialOverview;
