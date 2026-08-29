import mongoose from 'mongoose';
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { CURRENCY } from '../../config/constants.js';
import AppError from '../../utils/AppError.js';
import { reference as makeReference } from '../../utils/reference.js';
import { Donation, Donor } from '../fundraising/fundraising.model.js';
import * as paystack from './paystack.provider.js';
import * as paypal from './paypal.provider.js';

const log = logger.child({ module: 'checkout' });

/*
 * Starting a donation from the public page at /donate.
 *
 * ============================================================================================
 *  THE AMOUNT IS DECIDED HERE, IN CENTS, AND THE STATUS IS NEVER DECIDED BY THE BROWSER.
 * ============================================================================================
 *
 * Two rules carry this whole module.
 *
 * 1. NOTHING THE CLIENT SENDS ABOUT MONEY IS TRUSTED BEYOND A NUMBER OF RANDS. The rands are
 *    converted to integer cents here, bounded, and written to the Donation before the gateway
 *    is called. The gateway is then asked to collect THAT amount. When the money arrives, the
 *    webhook compares what the gateway says was paid against what this row says was asked for
 *    and refuses a mismatch — see payment.service.js, gate 4.
 *
 * 2. A DONATION IS BORN `PENDING` AND ONLY A WEBHOOK MAKES IT `SETTLED`. Not the redirect back
 *    from the gateway, not a success page, not a client call. The success page reads the row;
 *    it does not write it. A donor who closes the tab still gets a settled gift, and a donor
 *    who forges a redirect gets nothing.
 *
 * THE DONOR RECORD IS CREATED HERE TOO, and this is the part with a privacy edge. NWHR holds
 * donor details mainly to issue s18A certificates, so an anonymous gift still needs a name and
 * an email to send a receipt to — `isAnonymous` means "do not identify this person in
 * reporting", not "we know nothing about them". A donor who gives twice is matched on email
 * rather than duplicated, so their giving history stays in one place.
 */

/** Sanity bounds, in cents. Not policy — a floor under nuisance and a ceiling under typos. */
const MIN_CENTS = 10_00;
const MAX_CENTS = 500_000_00;

/**
 * Rands from a form → integer cents, or a 422 the form can render.
 *
 * Deliberately strict about what a number even is: `Number('')` is 0 and `Number('1e5')` is
 * 100 000, and neither should quietly become a donation.
 */
function amountToCents(rands) {
  const value = typeof rands === 'number' ? rands : Number(String(rands).replace(/\s/g, ''));

  if (!Number.isFinite(value) || value <= 0) {
    throw AppError.validationFailed({ amount: 'Enter an amount to give.' });
  }

  const cents = Math.round(value * 100);

  if (cents < MIN_CENTS) {
    throw AppError.validationFailed({ amount: 'The smallest gift we can process is R10.' });
  }
  if (cents > MAX_CENTS) {
    throw AppError.validationFailed({
      amount: 'For a gift this size, please contact the office so we can arrange it properly.',
    });
  }

  return cents;
}

/**
 * Find the donor by email, or create one.
 *
 * `source: 'ONLINE'` is what lets `capturedBy` stay null — see the model. An existing donor is
 * never overwritten from a public form: somebody could otherwise change a known donor's phone
 * number by donating R10 with their email address.
 */
async function resolveDonor({ name, email, phone, anonymous }) {
  const existing = await Donor.findOne({ email, deletedAt: null });
  if (existing) return existing;

  return Donor.create({
    name,
    type: 'INDIVIDUAL',
    email,
    phone: phone || null,
    isAnonymous: Boolean(anonymous),
    source: 'ONLINE',
    capturedBy: null,
  });
}

/**
 * Create a pending donation and hand back where to send the donor.
 *
 * `_ctx` is accepted and not yet used: it carries the IP and user agent that an audit entry
 * will need the day donations are audited the way beneficiary reads already are. Kept in the
 * signature so adding that is a change to this function rather than to every caller.
 *
 * @returns {Promise<{ reference: string, redirectUrl: string, amountCents: number }>}
 */
export async function startDonation(input, _ctx = {}) {
  const amountCents = amountToCents(input.amount);

  const provider = input.paymentMethod === 'PAYPAL' ? paypal : paystack;
  const configured =
    input.paymentMethod === 'PAYPAL' ? paypal.isPaypalConfigured() : paystack.isPaystackConfigured();

  if (!configured) {
    /*
     * `internal` rather than a 503 of its own: AppError has no unavailable() and inventing one
     * for a single call site would put a new status code in the envelope every client already
     * maps. What matters is the MESSAGE — the code is fine and the deployment is not, so the
     * donor is told to telephone rather than shown a stack trace.
     */
    throw AppError.internal(
      'Card payments are not available at the moment. Please telephone the office.'
    );
  }

  const donor = await resolveDonor(input);
  const donationReference = makeReference('DON');

  /*
   * Written BEFORE the gateway is called, deliberately. If the gateway call fails the row is
   * an orphaned PENDING donation, which is harmless and visible. The other order — call the
   * gateway, then write — loses the record of a payment somebody may already be completing.
   */
  const donation = await Donation.create({
    reference: donationReference,
    donor: donor._id,
    amountCents,
    currency: CURRENCY,
    method: input.paymentMethod,
    donationType: 'ONE_TIME',
    status: 'PENDING',
    message: input.message ?? '',
    capturedBy: null,
  });

  const returnTo = `${env.APP_URL}/donate/success?reference=${encodeURIComponent(donationReference)}`;

  try {
    const started = await provider.initialiseTransaction({
      email: donor.email,
      amountCents,
      reference: donationReference,
      callbackUrl: returnTo,
      cancelUrl: `${env.APP_URL}/donate?cancelled=1`,
    });

    /*
     * PayPal hands back an order id at creation and a capture id only later; Paystack's
     * reference is stable from the start. Storing whichever exists now gives the webhook
     * something to match on either way — and the unique partial index on this field is what
     * makes settlement idempotent under retries.
     */
    const providerReference = started.providerOrderId ?? started.reference ?? null;
    if (providerReference) {
      donation.providerReference = providerReference;
      await donation.save();
    }

    return { reference: donationReference, redirectUrl: started.authorizationUrl, amountCents };
  } catch (error) {
    // The row stays PENDING and is marked so a person can see why nothing happened.
    donation.status = 'FAILED';
    donation.notes = 'The payment could not be started with the gateway.';
    await donation.save();

    // Message only: a gateway error body can carry the key it was called with.
    log.error({ reference: donationReference, message: error.message }, 'could not start payment');
    throw AppError.internal('We could not start the payment. Please try again.');
  }
}

/**
 * What the success page is allowed to know.
 *
 * DELIBERATELY NOT THE DONATION DOCUMENT. This is a public, unauthenticated read keyed on a
 * reference that travels in a URL — through browser history, a Referer header and any proxy in
 * between. So it answers with the four facts a receipt needs and nothing else: no donor id, no
 * email, no phone, no internal notes, no provider reference.
 *
 * The donor's NAME is included because the page thanks them by it and they supplied it in the
 * same session; an anonymous donor gets no name back at all.
 */
export async function readDonationReceipt(reference) {
  if (!reference || typeof reference !== 'string') throw AppError.notFound('Donation');

  const donation = await Donation.findOne({ reference }).populate('donor', 'name isAnonymous');
  if (!donation) throw AppError.notFound('Donation');

  const donor = donation.donor && !donation.donor.isAnonymous ? donation.donor.name : null;

  return {
    reference: donation.reference,
    amountCents: donation.amountCents,
    currency: donation.currency,
    method: donation.method,
    status: donation.status,
    receiptNumber: donation.receiptNumber,
    donorName: donor,
    // The moment the money actually arrived, where there is one. A pending gift has none,
    // and printing `createdAt` in its place would date a receipt to an unpaid attempt.
    settledAt: donation.settledAt,
    createdAt: donation.createdAt,
  };
}

/**
 * Settle a PayPal order, from its webhook.
 *
 * The Paystack twin of this lives in payment.service.js and runs four gates. This runs the
 * same four, in the same order, against PayPal's vocabulary — approval is not payment there,
 * so an approved order is captured first and only the capture counts.
 */
export async function settlePaypalOrder(orderId, _ctx = {}) {
  const captured = await paypal.captureOrder(orderId);
  if (!captured) return { handled: false, reason: 'capture_failed' };

  if (captured.status !== 'success') {
    return { handled: false, reason: 'not_successful' };
  }

  const donation = await Donation.findOne({ reference: captured.reference });
  if (!donation) return { handled: false, reason: 'unknown_reference' };
  if (donation.status === 'SETTLED') return { handled: false, reason: 'already_settled' };

  if (captured.amountCents !== donation.amountCents || captured.currency !== donation.currency) {
    // Refused and left PENDING for a person to look at, exactly as the Paystack path does.
    log.error(
      {
        reference: captured.reference,
        expectedCents: donation.amountCents,
        receivedCents: captured.amountCents,
      },
      'PayPal amount or currency mismatch'
    );
    return { handled: false, reason: 'amount_mismatch' };
  }

  donation.status = 'SETTLED';
  donation.settledAt = captured.paidAt ?? new Date();
  donation.providerReference = captured.providerReference;
  await donation.save();

  await Donor.updateOne(
    { _id: donation.donor },
    { $inc: { totalGivenCents: donation.amountCents }, $set: { lastGiftAt: donation.settledAt } }
  );

  log.info({ reference: donation.reference }, 'PayPal donation settled');
  return { handled: true, reference: donation.reference };
}

/** Exposed for the admin dashboard's summary. Kept here so the aggregation lives with the money. */
export async function donationSummary() {
  const [totals] = await Donation.aggregate([
    { $match: { deletedAt: null } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        settled: { $sum: { $cond: [{ $eq: ['$status', 'SETTLED'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
        // Only settled money counts. A pending total is a number that has not arrived.
        raisedCents: {
          $sum: { $cond: [{ $eq: ['$status', 'SETTLED'] }, '$amountCents', 0] },
        },
      },
    },
  ]);

  const byMethod = await Donation.aggregate([
    { $match: { deletedAt: null, status: 'SETTLED' } },
    { $group: { _id: '$method', count: { $sum: 1 }, amountCents: { $sum: '$amountCents' } } },
    { $sort: { amountCents: -1 } },
  ]);

  return {
    count: totals?.count ?? 0,
    settled: totals?.settled ?? 0,
    pending: totals?.pending ?? 0,
    failed: totals?.failed ?? 0,
    raisedCents: totals?.raisedCents ?? 0,
    byMethod: byMethod.map(({ _id, count, amountCents }) => ({ method: _id, count, amountCents })),
  };
}

// Re-exported so a caller does not have to reach into mongoose for an ObjectId check.
export const isObjectId = (value) => mongoose.isValidObjectId(value);
