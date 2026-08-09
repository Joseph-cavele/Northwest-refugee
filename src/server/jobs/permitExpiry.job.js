import { loggerFor } from '../config/logger.js';
import { PERMISSIONS } from '../config/permissions.js';
import { findExpiringPermits } from '../modules/beneficiaries/beneficiary.service.js';
import { notifyPermission } from '../modules/notifications/notification.service.js';
import { isWhatsAppConfigured, sendMessage } from '../modules/whatsapp/whatsapp.client.js';
import { prompt } from '../modules/whatsapp/prompts.js';

const log = loggerFor('permitExpiry.job');

// How far ahead to look. Matches the longest reminder below — a wider horizon would only
// pull rows the job then ignores.
const HORIZON_DAYS = 30;

/**
 * Reminders go out on these days remaining and no others.
 *
 * This IS the idempotency. The job runs daily against a rolling window, so a rule like
 * "anything under 30 days" would message the same person every morning for a month —
 * from a number they cannot reply to at 2am, about a document that frightens them. An
 * exact-day match sends each reminder once, with no state to track and nothing to reset
 * if a run is missed.
 *
 * PLACEHOLDER SCHEDULE: 30/14/7/1 is a reasonable default, not NWHR's policy. DHA renewal
 * appointments are the real constraint and they are not booked in a day.
 */
const REMINDER_DAYS = Object.freeze([30, 14, 7, 1]);

// Already lapsed. Reminded once on the day it happens rather than every day after, for the
// same reason.
const LAPSED_ON_DAY = 0;

/**
 * Tell people their permit is running out, and tell the office what is coming.
 *
 * Two audiences, deliberately different. The beneficiary gets a message in their own
 * language that names no permit number and no immigration status — a WhatsApp reminder is
 * read on a phone that may be shared, and may be read by someone the person is hiding
 * from. Staff get counts and a pointer to the register, never a list of names in a bell
 * notification.
 */
export async function runPermitExpiry() {
  const due = await findExpiringPermits(HORIZON_DAYS);

  if (due.length === 0) {
    log.info('no permits expiring within the horizon');
    return { checked: 0, messaged: 0, failed: 0, lapsed: 0 };
  }

  const lapsed = due.filter((b) => b.daysRemaining < 0);
  const toMessage = due.filter(
    (b) => b.cellphone && [...REMINDER_DAYS, LAPSED_ON_DAY].includes(b.daysRemaining)
  );

  let messaged = 0;
  let failed = 0;

  if (toMessage.length > 0 && !isWhatsAppConfigured()) {
    // Worth a warning rather than silence: the reminders simply did not go out, and the
    // office will assume they did.
    log.warn({ pending: toMessage.length }, 'WhatsApp not configured — permit reminders not sent');
  } else {
    for (const person of toMessage) {
      // Sequential on purpose. Meta rate-limits by phone number id, and a burst of a
      // hundred sends is how a business account gets throttled for the rest of the day.
      const body = prompt(person.language, 'PERMIT_EXPIRY')(person.daysRemaining);
      const sent = await sendMessage(person.cellphone, body);

      if (sent) messaged += 1;
      else failed += 1;

      // Reference codes only — a cellphone number in a log line identifies a beneficiary
      // as surely as their name does.
      log.debug(
        { reference: person.referenceCode, daysRemaining: person.daysRemaining, sent },
        'permit reminder'
      );
    }
  }

  // One digest for the whole run. A notification per beneficiary would bury the bell menu
  // on the first day of the month and disclose, in a list anyone can read over a shoulder,
  // exactly who is undocumented next week.
  await notifyPermission(PERMISSIONS.BENEFICIARY_UPDATE, {
    title: 'Permits due for renewal',
    message:
      `${due.length} ${due.length === 1 ? 'permit' : 'permits'} expire within ${HORIZON_DAYS} days` +
      (lapsed.length > 0 ? `, ${lapsed.length} already lapsed` : '') +
      '. Open the register to see who.',
    // SYSTEM, not BENEFICIARY: `type` tells the frontend which collection `referenceId`
    // points into, and a digest points at no single record. Typing it BENEFICIARY with a
    // null id is a click that resolves to nothing.
    type: 'SYSTEM',
    priority: lapsed.length > 0 ? 'HIGH' : undefined,
  });

  const summary = { checked: due.length, messaged, failed, lapsed: lapsed.length };
  log.info(summary, 'permit expiry run complete');
  return summary;
}

export default runPermitExpiry;
