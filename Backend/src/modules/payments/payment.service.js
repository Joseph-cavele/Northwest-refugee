import { loggerFor, logSecurityEvent } from '../../config/logger.js';
import { CURRENCY } from '../../config/constants.js';
import * as fundraising from '../fundraising/fundraising.service.js';
import { verifyTransaction, HANDLED_EVENTS } from './paystack.provider.js';

const log = loggerFor('payment.service');

// What happens after a webhook's signature has already been checked by the route.
//
// FOUR GATES BEFORE MONEY COUNTS. Each exists because the one before it is not enough:
//
//   1. signature       — proves Paystack sent it (in the route, over the raw bytes)
//   2. known reference — proves it is about a donation this system created
//   3. server-to-server verify — proves the payment actually succeeded. A valid signature
//      says who sent the message, NOT that its contents are true; a replayed-but-genuine
//      body from a failed attempt would otherwise settle a donation nobody paid.
//   4. amount and currency match — proves the money that arrived is the money we asked
//      for. Without it, a R5 payment against a R5 000 pledge settles the pledge in full.
//
// The fifth protection is idempotency, and it lives in settleDonation(): its conditional
// update on `status: 'PENDING'` is what makes a retried notification a no-op rather than a
// double count. Gateways retry as a matter of course — that is not an error path.

/**
 * Process a verified webhook event.
 *
 * Always resolves. The route has already answered 200, and every outcome below — unknown
 * reference, failed payment, mismatched amount — is something that legitimately happens
 * and must not become an unhandled rejection.
 *
 * @returns {Promise<{ handled: boolean, reason?: string }>}
 */
export async function handlePaystackEvent(event, ctx = {}) {
  const type = event?.event;

  if (!HANDLED_EVENTS.includes(type)) {
    // Paystack sends transfer, refund, subscription and dispute events on the same hook.
    // Acknowledged and ignored rather than treated as an error.
    log.info({ type }, 'ignoring an unhandled Paystack event');
    return { handled: false, reason: 'unhandled_event' };
  }

  const reference = event?.data?.reference;
  if (!reference) return { handled: false, reason: 'no_reference' };

  // --- gate 2: is this about something we created? ---
  const donation = await fundraising.findDonationByReference(reference);
  if (!donation) {
    log.warn({ reference }, 'Paystack webhook for an unknown reference');
    return { handled: false, reason: 'unknown_reference' };
  }

  if (donation.status === 'SETTLED') {
    // The retry case, and the common one. Nothing to do and nothing wrong.
    return { handled: false, reason: 'already_settled' };
  }

  // --- gate 3: ask Paystack directly, rather than believing the body ---
  const verified = await verifyTransaction(reference);
  if (!verified) {
    log.error({ reference }, 'could not verify a Paystack transaction');
    return { handled: false, reason: 'verify_failed' };
  }

  if (verified.status !== 'success') {
    log.warn({ reference, status: verified.status }, 'Paystack transaction did not succeed');
    return { handled: false, reason: 'not_successful' };
  }

  // --- gate 4: does the money match what was asked for? ---
  if (verified.amountCents !== donation.amountCents) {
    // A security event, not a bookkeeping one: the amount was altered somewhere between
    // the donation being created and the money arriving. It is refused and left PENDING
    // for a person to look at, never partially settled.
    logSecurityEvent('payment_amount_mismatch', {
      reference,
      expectedCents: donation.amountCents,
      receivedCents: verified.amountCents,
    });
    return { handled: false, reason: 'amount_mismatch' };
  }

  if (verified.currency !== CURRENCY) {
    logSecurityEvent('payment_currency_mismatch', { reference, currency: verified.currency });
    return { handled: false, reason: 'currency_mismatch' };
  }

  // Idempotent. A concurrent retry that gets here first wins; this one changes nothing.
  await fundraising.settleDonation(
    donation._id,
    { providerReference: verified.reference, settledAt: verified.paidAt ?? new Date() },
    // No actor: a gateway is not a person. The audit row records a null actor, which is
    // what AuditLog.actor being nullable is for.
    null,
    ctx
  );

  return { handled: true };
}
