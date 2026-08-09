import { after, NextResponse } from 'next/server';
import logger from '@/server/config/logger';
import { connectDB } from '@/server/config/db';
import {
  verifySignature,
  verifyWebhookChallenge,
  extractMessages,
  extractFailedStatuses,
} from '@/server/modules/whatsapp/whatsapp.client';
import { handleMessage, respond } from '@/server/modules/whatsapp/bot.service';
import { clientIp } from '@/server/http/route';

/*
 * Meta's inbound webhook.
 *
 * NOT wrapped in route(): the signature is an HMAC-SHA256 over the raw body bytes, so the
 * body must be read as text and never parsed first. The endpoint is public by necessity —
 * Meta holds no credentials of ours — so THE SIGNATURE IS THE AUTHENTICATION.
 *
 * There is no separate delivery-status route: unlike a per-callback provider, the Cloud API
 * sends messages and receipts through this one hook, distinguished by which key the payload
 * carries.
 */

/**
 * The verification handshake Meta performs when the webhook URL is saved in the app
 * dashboard, and re-runs occasionally afterwards.
 *
 * The challenge must be echoed back as PLAIN TEXT. Wrapping it in this API's usual JSON
 * envelope fails verification, and the dashboard reports only a generic error — which is a
 * long afternoon if you do not already know to look here.
 */
export async function GET(request) {
  const params = new URL(request.url).searchParams;

  const challenge = verifyWebhookChallenge({
    mode: params.get('hub.mode'),
    token: params.get('hub.verify_token'),
    challenge: params.get('hub.challenge'),
  });

  if (challenge === null) {
    logger.warn('rejected a WhatsApp webhook verification attempt');
    return new NextResponse(null, { status: 403 });
  }

  return new NextResponse(String(challenge), {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

export async function POST(request) {
  const raw = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifySignature({ signature, rawBody: raw })) {
    // No detail in the response: an attacker probing this should learn nothing about why
    // it failed.
    logger.warn({ hasSignature: Boolean(signature) }, 'rejected an unsigned WhatsApp webhook');
    return new NextResponse(null, { status: 403 });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    logger.warn('WhatsApp webhook carried a valid signature but unparseable JSON');
    return new NextResponse(null, { status: 200 });
  }

  const ctx = { ip: clientIp(request), userAgent: 'whatsapp-cloud-api' };

  /*
   * Answer Meta first. A non-200 is retried with backoff, and classification can take
   * seconds — holding the request open risks a timeout and a duplicate delivery. Replies go
   * out over the Graph API once the work is done.
   *
   * `after()` rather than a floating promise: on a serverless runtime, returning the
   * response ends the invocation and unawaited work is killed. See the Paystack handler.
   */
  after(async () => {
    try {
      await connectDB();

      for (const failure of extractFailedStatuses(payload)) {
        logger.warn(failure, 'WhatsApp message not delivered');
      }

      /*
       * A single webhook call can carry more than one message. Handled IN SEQUENCE rather
       * than in parallel: two messages from the same person are two steps of one
       * conversation, and running them concurrently would race on the same session
       * document — which is how an intake ends up half-finished with nothing to show why.
       */
      for (const message of extractMessages(payload)) {
        try {
          const reply = await handleMessage({
            from: message.from,
            body: message.body,
            mediaId: message.mediaId,
            messageId: message.messageId,
            ctx,
          });
          await respond(message.from, reply);
        } catch (err) {
          // One bad message must not abandon the rest of the batch.
          logger.error({ err }, 'WhatsApp message handling failed');
        }
      }
    } catch (err) {
      logger.error({ err }, 'WhatsApp webhook processing failed');
    }
  });

  return new NextResponse(null, { status: 200 });
}
