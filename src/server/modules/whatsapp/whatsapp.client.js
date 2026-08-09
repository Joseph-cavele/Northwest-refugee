import crypto from 'node:crypto';
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { normalisePhone, toWhatsAppId } from '../../utils/phone.js';

// Meta WhatsApp Cloud API — transport only. The state machine lives in bot.service.js and
// never touches this file's wire format, which is why swapping the provider under it did
// not change a single question the bot asks.
//
// Three differences from a URL-signed webhook, each of which has its own trap:
//   - Meta signs the raw request BODY with the app secret (X-Hub-Signature-256), not the
//     URL and parameters. Re-serialising the JSON before verifying breaks every signature.
//   - Inbound media arrives as an OPAQUE ID, not a URL. Fetching it is two calls.
//   - Numbers are bare digits ('27821234567'), with no 'whatsapp:' prefix and no '+'.

const GRAPH_BASE = 'https://graph.facebook.com';

const CONFIGURED = Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN);

if (!CONFIGURED) {
  logger.warn(
    'WhatsApp Cloud API is not configured — the bot will accept messages but cannot reply'
  );
}

export function isWhatsAppConfigured() {
  return CONFIGURED;
}

const apiUrl = (path) => `${GRAPH_BASE}/${env.WHATSAPP_API_VERSION}/${path}`;

const authHeaders = () => ({ Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` });

/** Cloud API addresses a recipient by bare digits — no '+' and no 'whatsapp:' prefix. */
export function toWhatsAppAddress(phone) {
  return toWhatsAppId(phone);
}

/** And back to the E.164 form the rest of the system stores. */
export function fromWhatsAppAddress(address) {
  return normalisePhone(address);
}

// --- inbound ---------------------------------------------------------------------

/**
 * Verify that a webhook really came from Meta.
 *
 * The signature is `sha256=<hex>` over the RAW body bytes, keyed by the app secret. Two
 * things matter here beyond getting the HMAC right:
 *   - compare in constant time, so a timing side channel cannot be used to forge a digest;
 *   - fail closed on a missing secret. This endpoint is public by necessity, and every
 *     message it accepts starts a conversation that collects personal information.
 */
export function verifySignature({ signature, rawBody }) {
  if (!env.WHATSAPP_APP_SECRET) return false;
  if (!signature || !rawBody) return false;

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex');

  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch rather than returning false, and a forged
  // header is very often the wrong length.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * The one-time GET handshake Meta performs when the webhook URL is saved.
 *
 * Returns the challenge to echo back verbatim, or null to refuse. The challenge must be
 * returned as PLAIN TEXT — a JSON-wrapped body fails verification with no useful error.
 */
export function verifyWebhookChallenge({ mode, token, challenge }) {
  if (!env.WHATSAPP_VERIFY_TOKEN) return null;
  if (mode !== 'subscribe') return null;
  if (token !== env.WHATSAPP_VERIFY_TOKEN) return null;
  return challenge ?? null;
}

/**
 * Pull the messages out of a webhook payload.
 *
 * The envelope is deeply nested and mostly not about messages: Meta delivers delivery
 * receipts and read receipts (`statuses`) through the same hook, and those must not be
 * treated as things a person said. Only `messages` entries are returned.
 *
 * @returns {Array<{ from: string, body: string, mediaId: string|null, messageId: string|null }>}
 */
export function extractMessages(payload) {
  const out = [];

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const message of change?.value?.messages ?? []) {
        out.push({
          from: fromWhatsAppAddress(message.from),
          // Only `text` carries words. A caption on an image is the person talking too, so
          // it is read where present.
          body: message.text?.body ?? message.image?.caption ?? message.document?.caption ?? '',
          // Images and documents both arrive as an id to be resolved separately.
          mediaId: message.image?.id ?? message.document?.id ?? null,
          messageId: message.id ?? null,
        });
      }
    }
  }

  return out;
}

/**
 * Delivery and read receipts, which arrive through the same webhook as messages.
 *
 * Only the failures are worth surfacing — a message that could not be delivered means a
 * person is waiting on a reply that never came — and there is nothing to do about it
 * in-band, so these are logged rather than acted on.
 *
 * @returns {Array<{ status: string, code: number|null, title: string|null }>}
 */
export function extractFailedStatuses(payload) {
  const out = [];

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const status of change?.value?.statuses ?? []) {
        if (status.status !== 'failed' && status.status !== 'undelivered') continue;
        const error = status.errors?.[0] ?? null;
        // No recipient id: that is a beneficiary's number.
        out.push({ status: status.status, code: error?.code ?? null, title: error?.title ?? null });
      }
    }
  }

  return out;
}

// --- outbound --------------------------------------------------------------------

/**
 * Send a text message. Returns false rather than throwing — a failed reply must not roll
 * back a conversation step that has already been recorded, or the person would be asked
 * the same question twice.
 */
export async function sendMessage(to, body) {
  if (!CONFIGURED) {
    logger.warn('WhatsApp Cloud API not configured — reply not sent');
    return false;
  }

  const recipient = toWhatsAppAddress(to);
  if (!recipient) {
    logger.error('cannot send: unparseable destination number');
    return false;
  }

  try {
    const res = await fetch(apiUrl(`${env.WHATSAPP_PHONE_NUMBER_ID}/messages`), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        // preview_url off: a link in a bot reply should not fetch a third-party page and
        // render its title into a conversation with a beneficiary.
        text: { preview_url: false, body },
      }),
    });

    if (!res.ok) {
      // The status and Meta's error code, never the recipient or the body: one is a
      // beneficiary's number, the other can quote what they told us.
      const detail = await res.json().catch(() => null);
      logger.error(
        { status: res.status, code: detail?.error?.code, type: detail?.error?.type },
        'WhatsApp send rejected by the Cloud API'
      );
      return false;
    }

    return true;
  } catch (err) {
    logger.error({ err }, 'failed to send WhatsApp message');
    return false;
  }
}

/**
 * Fetch an inbound attachment (a permit photo) as a buffer.
 *
 * Two calls, not one: the id resolves to a short-lived, single-use download URL, and that
 * URL still needs the Bearer token — an unauthenticated fetch of it returns 401. The bytes
 * go straight to the documents service and are never written to disk.
 */
export async function fetchMedia(mediaId) {
  if (!CONFIGURED || !mediaId) return null;

  try {
    const lookup = await fetch(apiUrl(mediaId), { headers: authHeaders() });
    if (!lookup.ok) {
      logger.error({ status: lookup.status }, 'failed to resolve WhatsApp media id');
      return null;
    }

    const { url, mime_type: mimeType } = await lookup.json();
    if (!url) return null;

    const download = await fetch(url, { headers: authHeaders() });
    if (!download.ok) {
      logger.error({ status: download.status }, 'failed to download WhatsApp media');
      return null;
    }

    return {
      buffer: Buffer.from(await download.arrayBuffer()),
      contentType:
        mimeType ?? download.headers.get('content-type') ?? 'application/octet-stream',
    };
  } catch (err) {
    logger.error({ err }, 'failed to fetch WhatsApp media');
    return null;
  }
}
