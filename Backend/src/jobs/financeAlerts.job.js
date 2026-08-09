import { loggerFor } from '../config/logger.js';
import { PERMISSIONS } from '../config/permissions.js';
import { formatZAR } from '../utils/money.js';
import { notify, notifyPermission } from '../modules/notifications/notification.service.js';
import {
  findBudgetLinesNearLimit,
  findStaleApprovals,
  findUnreconciledFloats,
} from '../modules/finance/finance.service.js';

const log = loggerFor('financeAlerts.job');

// PLACEHOLDER THRESHOLDS: replace with NWHR's finance policy before go-live. Each of these
// is the point at which somebody is told, so a threshold set too loosely produces an alert
// that arrives after the only moment it could have changed anything — and one set too
// tightly produces a weekly message everyone learns to ignore, which is the same failure.
const NEAR_LIMIT_PERCENT = 90; // of allocation, committed + spent
const STALE_APPROVAL_DAYS = 3; // submitted spend nobody has decided on
const UNRECONCILED_FLOAT_DAYS = 30; // since a float was last counted

/**
 * The weekly finance watch: budget lines running out, approvals nobody has answered, and
 * cash nobody has counted.
 *
 * Each alert goes to whoever holds the permission that can resolve it, resolved through
 * the permission matrix rather than a role name — re-granting `transaction:approve`
 * re-routes the alert with it, instead of leaving a queue nobody is told about.
 *
 * The custodian of an unreconciled float is told as well as the reconcilers, and that is
 * not a courtesy: they are answerable for the cash and may not count it themselves, so
 * they are the person who has to ask someone else to.
 */
export async function runFinanceAlerts() {
  const [nearLimit, staleApprovals, unreconciled] = await Promise.all([
    findBudgetLinesNearLimit(NEAR_LIMIT_PERCENT),
    findStaleApprovals(STALE_APPROVAL_DAYS),
    findUnreconciledFloats(UNRECONCILED_FLOAT_DAYS),
  ]);

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // --- budget lines at the edge of their allocation ---
  if (nearLimit.length > 0) {
    // Anything past 100% is already committed beyond what was approved, which is a
    // different conversation from "watch this one".
    const overspent = nearLimit.filter((line) => line.usedPercent >= 100);
    const worst = nearLimit[0];

    await notifyPermission(PERMISSIONS.BUDGET_READ, {
      title: overspent.length > 0 ? 'Budget lines overspent' : 'Budget lines nearly spent',
      message:
        `${plural(nearLimit.length, 'line')} at or above ${NEAR_LIMIT_PERCENT}% of allocation` +
        (overspent.length > 0 ? `, ${overspent.length} over` : '') +
        `. Highest: ${worst.reference} ${worst.code} at ${worst.usedPercent}%.`,
      type: 'SYSTEM',
      priority: overspent.length > 0 ? 'HIGH' : undefined,
    });
  }

  // --- spend waiting on a decision ---
  if (staleApprovals.length > 0) {
    const oldest = staleApprovals[0];
    const waitingDays = Math.floor((Date.now() - oldest.submittedAt.getTime()) / 86_400_000);

    await notifyPermission(PERMISSIONS.TRANSACTION_APPROVE, {
      title: 'Transactions awaiting approval',
      message:
        `${plural(staleApprovals.length, 'transaction')} submitted more than ` +
        `${STALE_APPROVAL_DAYS} days ago. Oldest: ${oldest.reference}, ` +
        `${formatZAR(oldest.amountCents, { plain: true })}, waiting ${waitingDays} days.`,
      type: 'SYSTEM',
      priority: 'HIGH',
    });
  }

  // --- cash nobody has counted ---
  if (unreconciled.length > 0) {
    const neverCounted = unreconciled.filter((f) => f.lastReconciledAt === null);

    await notifyPermission(PERMISSIONS.PETTY_CASH_RECONCILE, {
      title: 'Petty cash floats need counting',
      message:
        `${plural(unreconciled.length, 'float')} not reconciled in ${UNRECONCILED_FLOAT_DAYS} days` +
        (neverCounted.length > 0 ? `, ${neverCounted.length} never counted` : '') +
        '.',
      type: 'SYSTEM',
      priority: neverCounted.length > 0 ? 'HIGH' : undefined,
    });

    for (const float of unreconciled) {
      await notify({
        userId: float.custodian,
        title: 'Your petty cash float needs counting',
        message:
          `${float.reference} (${float.name}) holds ` +
          `${formatZAR(float.balanceCents, { plain: true })} and ` +
          `${float.lastReconciledAt ? 'has not been counted recently' : 'has never been counted'}. ` +
          'Ask a colleague to reconcile it — you may not count your own float.',
        type: 'SYSTEM',
      });
    }
  }

  // Amounts and references only. No payee, no description: a transaction line can name a
  // beneficiary receiving assistance.
  const summary = {
    budgetLinesNearLimit: nearLimit.length,
    staleApprovals: staleApprovals.length,
    unreconciledFloats: unreconciled.length,
  };
  log.info(summary, 'finance alerts run complete');
  return summary;
}

export default runFinanceAlerts;
