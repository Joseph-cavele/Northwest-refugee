import crypto from 'node:crypto';
import env from '../../config/env.js';
import { loggerFor } from '../../config/logger.js';
import { CURRENCY } from '../../config/constants.js';

const log = loggerFor('paystack.provider');

// Paystack, the only payment gateway in the system. Transport and verification only —
// nothing here decides what a donation means; that is fundraising.service.js.
//
// The secret key does double duty: it authorises outbound API calls AND is the HMAC key
// for inbound webhook signatures. It must never reach the browser. The public key is the
// one the frontend initialises a payment with.
//
// PAYSTACK WORKS IN THE SUBUNIT — kobo, or in our case cents. That happens to match how
// this system stores money everywhere, so amounts pass through untouched. Do not "helpfully"
// divide by 100 on the way out.

const API_BASE = 'https://api.paystack.co';

const CONFIGURED = Boolean(env.PAYSTACK_SECRET_KEY);

if (!CONFIGURED) {
  log.warn('PAYSTACK_SECRET_KEY not set — online donations are disabled');
}

export function isPaystackConfigured() {
  return CONFIGURED;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Verify an inbound webhook really came from Paystack.
 *
 * HMAC-SHA512 of the RAW body bytes, keyed by the secret key, compared against
 * `x-paystack-signature`. Note the algorithm: SHA512, not the SHA256 most gateways use —
 * a SHA256 digest here silently fails every legitimate notification.
 *
 * Fails closed on a missing key, and compares in constant time so a timing side channel
 * cannot be used to forge a digest.
 */
export function verifyWebhookSignature({ signature, rawBody }) {
  if (!env.PAYSTACK_SECRET_KEY) return false;
  if (!signature || !rawBody) return false;

  const expected = crypto
    .createHmac('sha512', env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch rather than returning false, and a forged
  // header is very often the wrong length.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Start a payment and return the URL to send the donor to.
 *
 * `reference` is OUR reference, not Paystack's. Passing our own means the webhook can be
 * matched back to the donation we already created, rather than guessing from an amount and
 * a timestamp.
 *
 * @param {object} args
 * @param {string} args.email        the donor's address — Paystack requires one
 * @param {number} args.amountCents  integer cents; sent verbatim as the subunit amount
 * @param {string} args.reference    our donation reference
 * @param {string} [args.callbackUrl] where the donor is returned after paying
 */
export async function initialiseTransaction({ email, amountCents, reference, callbackUrl, metadata }) {
  if (!CONFIGURED) throw new Error('Paystack is not configured');

  const res = await fetch(`${API_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      email,
      amount: amountCents,
      currency: CURRENCY,
      reference,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      ...(metadata ? { metadata } : {}),
    }),
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok || !payload?.status) {
    log.error({ status: res.status, message: payload?.message }, 'Paystack initialise failed');
    throw new Error(payload?.message ?? 'Could not start the payment');
  }

  return {
    authorizationUrl: payload.data.authorization_url,
    accessCode: payload.data.access_code,
    reference: payload.data.reference,
  };
}

/**
 * Ask Paystack what it thinks a transaction is worth.
 *
 * A valid signature proves the message came from Paystack, not that its contents describe
 * a settled payment — so money is never counted on the webhook body alone. This is the
 * server-to-server confirmation, and it is the authority.
 *
 * @returns {Promise<{ status: string, amountCents: number, currency: string,
 *                     reference: string, paidAt: Date|null, channel: string|null } | null>}
 */
export async function verifyTransaction(reference) {
  if (!CONFIGURED) throw new Error('Paystack is not configured');

  const res = await fetch(`${API_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: authHeaders(),
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok || !payload?.status) {
    log.error({ status: res.status, reference, message: payload?.message }, 'Paystack verify failed');
    return null;
  }

  const data = payload.data;
  return {
    status: data.status, // 'success' | 'failed' | 'abandoned' | …
    amountCents: data.amount,
    currency: data.currency,
    reference: data.reference,
    paidAt: data.paid_at ? new Date(data.paid_at) : null,
    channel: data.channel ?? null,
  };
}

/** The events this system acts on. Anything else is acknowledged and ignored. */
export const HANDLED_EVENTS = Object.freeze(['charge.success']);
