import cron from 'node-cron';
import logger from '../config/logger.js';
import { TIMEZONE } from '../config/constants.js';
import { runPermitExpiry } from './permitExpiry.job.js';
import { runDailyRollup } from './dailyRollup.job.js';
import { runFinanceAlerts } from './financeAlerts.job.js';

// Cron jobs start with the server. On more than one instance every job fires on every
// instance — a permit-expiry run that messages each beneficiary twice is the visible
// symptom. Move to a single worker or a distributed lock before scaling horizontally.

// Schedules are Africa/Johannesburg local time (see TIMEZONE below), which is why they can
// be read as office hours rather than converted.
//
//   07:00 daily  — before the front desk opens, so the day starts with the reminders out
//   00:30 daily  — after midnight, so the rollup covers a whole closed day
//   08:00 Monday — the finance week begins with what is outstanding from the last one
const JOB_DEFINITIONS = [
  { name: 'permit-expiry', schedule: '0 7 * * *', handler: runPermitExpiry },
  { name: 'daily-rollup', schedule: '30 0 * * *', handler: runDailyRollup },
  { name: 'finance-alerts', schedule: '0 8 * * 1', handler: runFinanceAlerts },
];

const scheduled = [];

/**
 * A job that throws must never take the process with it. Cron handlers run outside the
 * request lifecycle, so there is no errorHandler downstream to catch them.
 */
function guard(name, handler) {
  return async function run() {
    const startedAt = Date.now();
    try {
      await handler();
      logger.info({ job: name, ms: Date.now() - startedAt }, 'job completed');
    } catch (err) {
      logger.error({ job: name, err }, 'job failed');
    }
  };
}

export function startJobs() {
  for (const { name, schedule, handler } of JOB_DEFINITIONS) {
    if (!cron.validate(schedule)) {
      // Fail loudly at boot: a malformed expression otherwise means the job simply
      // never runs, and nothing reports the silence.
      logger.error({ job: name, schedule }, 'invalid cron expression — job not scheduled');
      continue;
    }
    scheduled.push(cron.schedule(schedule, guard(name, handler), { timezone: TIMEZONE }));
    logger.info({ job: name, schedule, timezone: TIMEZONE }, 'job scheduled');
  }

  if (JOB_DEFINITIONS.length === 0) {
    logger.warn('no scheduled jobs registered');
  }
  return scheduled.length;
}

// Called during shutdown so in-flight work is not orphaned by the process exiting.
export function stopJobs() {
  for (const task of scheduled.splice(0)) {
    task.stop();
  }
}
