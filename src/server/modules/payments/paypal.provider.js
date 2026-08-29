import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { CURRENCY } from '../../config/constants.js';

const log = logger.child({ module: 'paypal' });

/*
 * PayPal Orders v2, as the second gateway beside Paystack.
 *
 * SHAPED DELIBERATELY LIKE paystack.provider.js — `isConfigured`, `initialiseTransaction`,
 * `verifyTransaction`, `verifyWebhookSignature` — so payment.service.js can settle a gift
 * without knowing which gateway it came from. The two are NOT interchangeable underneath and
 * the differences are exactly where a bug would hide:
 *
 *   auth        Paystack sends one secret key on every call. PayPal exchanges a client id and
 *               secret for a short-lived OAuth token, so this module holds a token cache.
 *   money       Paystack counts in the currency's minor unit (cents). PayPal takes a DECIMAL
 *               STRING — "250.00" — which is the one place in this system where an amount
 *               stops being an integer. It is converted at the boundary in both directions
 *               and never stored or compared in that form.
 *   signature   Paystack is a local HMAC-SHA512 over the raw body. PayPal cannot be verified
 *               locally at all: the signature is checked by CALLING PayPal with the headers
 *               and the body, which means webhook verification is an async network round trip
 *               and needs PAYPAL_WEBHOOK_ID, an id you only get after registering the hook.
 *   settlement  A Paystack transaction is settled when the webhook says so. A PayPal order is
 *               APPROVED by the payer and then has to be CAPTURED by us — approval alone
 *               moves no money, which is why `capture` exists here and has no Paystack twin.
 *
 * NOTHING HERE TRUSTS THE BROWSER. The order is created server-side with an amount the server
 * decided, and `verifyTransaction` re-reads the order from PayPal rather than believing any
 * status a redirect carried back.
 */

const LIVE = 'https://api-m.paypal.com';
const SANDBOX = 'https://api-m.sandbox.paypal.com';

/** Sandbox unless PAYPAL_ENV says otherwise, so a misconfiguration cannot take real money. */
const API_BASE = env.PAYPAL_ENV === 'live' ? LIVE : SANDBOX;

const CONFIGURED = Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);

export function isPaypalConfigured() {
  return CONFIGURED;
}

/*
 * The OAuth token, cached until shortly before it expires.
 *
 * PayPal tokens last about nine hours, and asking for a new one on every call would add a
 * round trip to every payment. Sixty seconds of headroom covers the clock skew between this
 * instance and PayPal's.
 *
 * PER-INSTANCE, like everything else in this deployment. A serverless instance that starts
 * cold fetches its own token, which is correct — the cache is an optimisation, not state.
 */
let cachedToken = null;

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const credentials = Buffer.from(
    `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok || !payload?.access_token) {
    // Status only. The body of a failed token exchange can echo the client id back.
    log.error({ status: res.status }, 'PayPal token exchange failed');
    throw new Error('Could not authenticate with PayPal');
  }

  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };

  return cachedToken.value;
}

async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const token = await accessToken();

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const payload = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, payload };
}

/** Cents → the decimal string PayPal insists on. 25_000 → "250.00". */
function toDecimalString(amountCents) {
  return (amountCents / 100).toFixed(2);
}

/** "250.00" → 25000. Rounded, because a float from JSON must never become 24999. */
function toCents(decimalString) {
  return Math.round(Number(decimalString) * 100);
}

/**
 * Create an order and return the URL the donor is sent to.
 *
 * The signature matches Paystack's initialiseTransaction so the calling service can treat
 * the two the same way.
 *
 * @returns {Promise<{ authorizationUrl: string, providerOrderId: string, reference: string }>}
 */
export async function initialiseTransaction({ amountCents, reference, callbackUrl, cancelUrl }) {
  if (!CONFIGURED) throw new Error('PayPal is not configured');

  const { ok, status, payload } = await call('/v2/checkout/orders', {
    method: 'POST',
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          // Our own reference travels with the order, so a webhook can be matched back to
          // the donation without trusting anything the browser returned.
          reference_id: reference,
          custom_id: reference,
          amount: { currency_code: CURRENCY, value: toDecimalString(amountCents) },
        },
      ],
      application_context: {
        brand_name: 'North West House of Refuge',
        user_action: 'PAY_NOW',
        return_url: callbackUrl,
        cancel_url: cancelUrl,
      },
    },
  });

  if (!ok || !payload?.id) {
    log.error({ status, name: payload?.name }, 'PayPal order creation failed');
    throw new Error('Could not start the payment');
  }

  const approve = payload.links?.find((link) => link.rel === 'approve' || link.rel === 'payer-action');
  if (!approve?.href) {
    log.error({ orderId: payload.id }, 'PayPal order has no approval link');
    throw new Error('Could not start the payment');
  }

  return { authorizationUrl: approve.href, providerOrderId: payload.id, reference };
}

/**
 * Capture an approved order. THIS is what moves the money.
 *
 * Idempotent from PayPal's side by order id: capturing twice returns the existing capture
 * with `ORDER_ALREADY_CAPTURED`, which is treated as success here rather than as an error —
 * the donor's money has moved either way, and a retried webhook must not fail.
 */
export async function captureOrder(orderId) {
  if (!CONFIGURED) throw new Error('PayPal is not configured');

  const { ok, status, payload } = await call(`/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
  });

  const alreadyCaptured = payload?.details?.some(
    (detail) => detail.issue === 'ORDER_ALREADY_CAPTURED'
  );

  if (!ok && !alreadyCaptured) {
    log.error({ status, name: payload?.name }, 'PayPal capture failed');
    return null;
  }

  return readOrder(orderId);
}

/**
 * Ask PayPal what an order is actually worth and whether it completed.
 *
 * The PayPal twin of Paystack's verifyTransaction, and the same rule applies: a redirect
 * arriving with `?status=success` proves nothing. This is the authority.
 *
 * @returns {Promise<{ status: string, amountCents: number, currency: string,
 *                     reference: string, providerReference: string, paidAt: Date|null } | null>}
 */
export async function readOrder(orderId) {
  const { ok, status, payload } = await call(`/v2/checkout/orders/${orderId}`);

  if (!ok || !payload?.id) {
    log.error({ status, orderId }, 'PayPal order lookup failed');
    return null;
  }

  const unit = payload.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const amount = capture?.amount ?? unit?.amount;

  return {
    // COMPLETED is PayPal's word for what Paystack calls success. Mapped here rather than at
    // the call site, so the service compares one vocabulary.
    status: payload.status === 'COMPLETED' ? 'success' : String(payload.status).toLowerCase(),
    amountCents: amount ? toCents(amount.value) : 0,
    currency: amount?.currency_code ?? '',
    reference: unit?.custom_id ?? unit?.reference_id ?? '',
    providerReference: capture?.id ?? payload.id,
    paidAt: capture?.create_time ? new Date(capture.create_time) : null,
  };
}

/**
 * Verify a webhook.
 *
 * NOT A LOCAL HMAC. PayPal will not let you check its signature offline — the transmission
 * id, timestamp, cert URL, algorithm and the raw body all go back to PayPal, which answers
 * SUCCESS or FAILURE. Two consequences worth knowing before relying on this:
 *
 *   it is a network call   The webhook handler cannot verify and answer 200 in the same
 *                          breath the way the Paystack one does. Verify first, then respond.
 *   it needs a webhook id  PAYPAL_WEBHOOK_ID is issued when the webhook is registered in the
 *                          PayPal dashboard. Without it this returns false and every
 *                          notification is refused — which is the correct failure direction.
 */
export async function verifyWebhookSignature({ headers, rawBody }) {
  if (!CONFIGURED || !env.PAYPAL_WEBHOOK_ID) {
    log.error('PayPal webhook secret is not configured — refusing the notification');
    return false;
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return false;
  }

  const { ok, payload } = await call('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: {
      auth_algo: headers.get('paypal-auth-algo'),
      cert_url: headers.get('paypal-cert-url'),
      transmission_id: headers.get('paypal-transmission-id'),
      transmission_sig: headers.get('paypal-transmission-sig'),
      transmission_time: headers.get('paypal-transmission-time'),
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: event,
    },
  });

  return ok && payload?.verification_status === 'SUCCESS';
}

/** The events worth acting on. Everything else is acknowledged and ignored. */
export const HANDLED_EVENTS = Object.freeze([
  'CHECKOUT.ORDER.APPROVED',
  'PAYMENT.CAPTURE.COMPLETED',
]);
