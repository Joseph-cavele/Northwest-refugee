import { loggerFor } from '../config/logger.js';
import { PERMISSIONS } from '../config/permissions.js';
import { notify, notifyPermission } from '../modules/notifications/notification.service.js';
import { findOverdue } from '../modules/serviceRequests/serviceRequest.service.js';
import { findEscalated } from '../modules/cases/case.service.js';
import { findAwaitingFollowUp } from '../modules/referrals/referral.service.js';
import { snapshotDailyMetrics } from '../modules/reports/report.service.js';

const log = loggerFor('dailyRollup.job');

/**
 * What is slipping, and whose desk it is on.
 *
 * The rollup is addressed, not broadcast. "The organisation has 47 overdue items" is a
 * number nobody owns; "3 of your service requests are past due" is one somebody acts on.
 * Work with no owner is the exception and goes to whoever can assign it, because an
 * unassigned overdue request is the one most likely to be nobody's problem.
 *
 * Counts only, in both directions. A bell notification naming a beneficiary discloses to
 * anyone reading over a shoulder; the recipient opens their queue, where the real access
 * check runs.
 */
export async function runDailyRollup() {
  const [overdueRequests, escalatedCases, staleReferrals] = await Promise.all([
    findOverdue(),
    findEscalated(),
    findAwaitingFollowUp(),
  ]);

  // owner id → what they are carrying. Built with String keys because an ObjectId is a
  // different object every time it is read, so Map identity would give one bucket per row.
  const byOwner = new Map();
  const add = (owner, key) => {
    if (!owner) return false;
    const id = String(owner);
    const entry = byOwner.get(id) ?? { requests: 0, cases: 0, referrals: 0 };
    entry[key] += 1;
    byOwner.set(id, entry);
    return true;
  };

  let unassignedRequests = 0;
  for (const request of overdueRequests) {
    if (!add(request.assignedTo, 'requests')) unassignedRequests += 1;
  }
  for (const file of escalatedCases) add(file.caseworker, 'cases');
  for (const referral of staleReferrals) add(referral.referredBy, 'referrals');

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  for (const [userId, carried] of byOwner) {
    const parts = [];
    if (carried.requests) parts.push(`${plural(carried.requests, 'request')} past due`);
    if (carried.cases) parts.push(`${plural(carried.cases, 'urgent case')} still open`);
    if (carried.referrals) parts.push(`${plural(carried.referrals, 'referral')} to chase`);

    await notify({
      userId,
      title: 'Your work needs attention',
      message: `${parts.join(' · ')}.`,
      // SYSTEM, not SERVICE_REQUEST: `type` tells the frontend which collection
      // `referenceId` points into, and a digest points at no single record.
      type: 'SYSTEM',
      priority: carried.cases > 0 ? 'HIGH' : undefined,
    });
  }

  // Unowned work has no one to address, so it goes to whoever can hand it to someone.
  if (unassignedRequests > 0) {
    await notifyPermission(PERMISSIONS.SERVICE_REQUEST_UPDATE, {
      title: 'Overdue work with nobody assigned',
      message: `${plural(unassignedRequests, 'overdue request')} ${
        unassignedRequests === 1 ? 'is' : 'are'
      } unassigned. Open the queue to assign ${unassignedRequests === 1 ? 'it' : 'them'}.`,
      type: 'SYSTEM',
      priority: 'HIGH',
    });
  }

  // The operational record of the run. Counts and no identifiers, so it is safe to ship to
  // a log aggregator that nobody holding beneficiary:read has an account on.
  const summary = {
    overdueRequests: overdueRequests.length,
    unassignedRequests,
    escalatedCases: escalatedCases.length,
    staleReferrals: staleReferrals.length,
    notified: byOwner.size,
  };
  log.info(summary, 'daily rollup complete');

  // The figures above are what is slipping right now, addressed to whoever owns it. The
  // snapshot is the separate, organisation-wide record of the day that just closed — the
  // job runs at 00:30, so "yesterday" is the last whole day there is.
  //
  // Best-effort, like an audit write: a metrics table that failed to write is a gap in a
  // report, while a rollup that failed to send is work nobody was told about. The second
  // matters more, and it has already succeeded by this point.
  const closedDay = new Date(Date.now() - 86_400_000);
  try {
    const snapshot = await snapshotDailyMetrics({ date: closedDay });
    log.info({ date: snapshot.date, metrics: snapshot.metrics }, 'daily metrics stored');
  } catch (err) {
    log.error({ err, date: closedDay }, 'daily metrics snapshot failed');
  }

  return summary;
}

export default runDailyRollup;
