import type { DashboardCard } from '@/api/reports.api';

/*
 * What needs a person today, derived from the figures the dashboard already has.
 *
 * NO NEW REQUEST. Every rule reads the cards the server has already sent, which buys the
 * permission gating for free and correctly: the cards endpoint only returns what the
 * caller's role earns, so an alert about casework cannot reach somebody who cannot see
 * casework. There is no second permission check here to get wrong.
 *
 * AN ALERT THAT ALWAYS FIRES IS ONE NOBODY READS. Every rule below can be quiet, and most
 * of them are on most days. Nothing here fires on a figure merely being non-zero when
 * non-zero is the normal state of that figure — "6 people awaiting verification" is a
 * queue, not an alarm, and it lives in the panels below rather than up here.
 */

export type AlertSeverity = 'serious' | 'warning';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  /** The fact, in one sentence, with the numbers in it. */
  message: string;
  /** What to do about it. Plain, and never an apology. */
  action: string;
}

/** Ranked so the list can be cut from the bottom without losing the worst thing on it. */
const SEVERITY_RANK: Record<AlertSeverity, number> = { serious: 0, warning: 1 };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * @param cards whatever the server sent for this user — no assumption that any given key
 *              is present, because a role that cannot see a thing gets no card for it.
 */
export function deriveAlerts(cards: DashboardCard[]): Alert[] {
  const value = (key: string): number | null => {
    const card = cards.find((c) => c.key === key);
    return card ? card.value : null;
  };

  const alerts: Alert[] = [];

  // --- work that has already missed its standard -----------------------------------
  const overdue = value('service_requests.overdue');
  const open = value('service_requests.open');

  if (overdue !== null && overdue > 0) {
    /*
     * Severity comes from the SHARE, not the count. Fourteen overdue out of two thousand
     * is a busy week; fourteen out of nineteen is a queue that has stopped moving, and the
     * two should not arrive on screen looking the same.
     */
    const share = open && open > 0 ? overdue / open : null;
    const serious = share !== null && share >= 0.5;

    alerts.push({
      id: 'requests-overdue',
      severity: serious ? 'serious' : 'warning',
      message:
        share !== null
          ? `${overdue} of ${plural(open!, 'open request')} are past the standard for their urgency.`
          : `${plural(overdue, 'service request')} are past the standard for their urgency.`,
      action: serious
        ? 'Most of the queue is late. Reassign or escalate before adding new work to it.'
        : 'Work the oldest first — the request that has waited longest is the one at risk.',
    });
  }

  // --- files someone is answerable for ---------------------------------------------
  const escalated = value('cases.escalated');
  if (escalated !== null && escalated > 0) {
    alerts.push({
      id: 'cases-escalated',
      severity: 'serious',
      message: `${plural(escalated, 'case')} marked high or urgent ${escalated === 1 ? 'is' : 'are'} still open.`,
      action: 'These are in “Needs a person today” below, oldest first.',
    });
  }

  // --- the one with a deadline nobody controls --------------------------------------
  const permits = value('permits.expiring_30d');
  if (permits !== null && permits > 0) {
    alerts.push({
      id: 'permits-expiring',
      severity: 'warning',
      message: `${plural(permits, 'permit')} lapse within 30 days.`,
      // An expired asylum permit is the single most consequential fact about somebody's
      // day, and the renewal is not something that can be started late.
      action: 'Start renewals now. Home Affairs appointments are not same-week.',
    });
  }

  const referrals = value('referrals.awaiting_follow_up');
  if (referrals !== null && referrals > 0) {
    alerts.push({
      id: 'referrals-stale',
      severity: 'warning',
      message: `${plural(referrals, 'referral')} ${referrals === 1 ? 'is' : 'are'} past its follow-up date.`,
      action: 'Chase the partner organisation, or record the outcome if it is already known.',
    });
  }

  // --- money waiting on a second person ---------------------------------------------
  const approvals = value('transactions.pending_approval');
  if (approvals !== null && approvals > 0) {
    alerts.push({
      id: 'transactions-pending',
      severity: 'warning',
      message: `${plural(approvals, 'transaction')} ${approvals === 1 ? 'is' : 'are'} waiting for approval.`,
      // Whoever raised it cannot clear it, by design — that is the maker-checker rule, not
      // a queue that will drain itself.
      action: 'Someone other than the person who raised each one has to approve it.',
    });
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
