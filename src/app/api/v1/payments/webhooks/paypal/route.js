import { after, NextResponse } from 'next/server';
import logger from '@/server/config/logger';
import { connectDB } from '@/server/config/db';
import { verifyWebhookSignature, HANDLED_EVENTS } from '@/server/modules/payments/paypal.provider';
import { settlePaypalOrder } from '@/server/modules/payments/checkout.service';
import { clientIp } from '@/server/http/route';

const log = logger.child({ module: 'paypal-webhook' });

/*
 * PayPal's webhook.
 *
 * NOT wrapped in route(), for the same reason the Paystack one is not: the verification needs
 * the RAW BODY. `await request.text()` is the whole of it — a Route Handler never parses a
 * body it is not asked to.
 *
 * WHERE IT DIFFERS FROM THE PAYSTACK HANDLER, AND WHY THE SHAPE IS NOT COPIED WHOLESALE:
 *
 *   verification is remote   Paystack's signature is an HMAC we compute locally, so that
 *                            handler can answer 200 immediately and work afterwards. PayPal's
 *                            can only be checked by asking PayPal, which is a network call —
 *                            so this one verifies BEFORE responding. An unverified body must
 *                            never reach the settlement path, and answering first would mean
 *                            exactly that.
 *
 *   approval is not payment  Paystack's charge.success means the money moved. PayPal's
 *                            CHECKOUT.ORDER.APPROVED means the payer said yes and nothing has
 *                            moved yet; the capture is ours to make. Both events land here and
 *                            both route to settlePaypalOrder, which captures first and settles
 *                            only on a completed capture.
 *
 * IT FAILS CLOSED. Without PAYPAL_WEBHOOK_ID the verifier returns false and every notification
 * is refused — which is the correct direction to fail for a handler that moves money.
 *
 * THE 200 IS DELIBERATE ON A REFUSED EVENT. PayPal retries anything else for days, and an
 * event we will never handle — a dispute, a subscription — would be retried forever. A refusal
 * is logged, not queued.
 */
export async function POST(request) {
  const rawBody = await request.text();

  const verified = await verifyWebhookSignature({ headers: request.headers, rawBody });
  if (!verified) {
    log.warn('rejected a PayPal notification with an invalid signature');
    return NextResponse.json({ received: false }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  if (!HANDLED_EVENTS.includes(event?.event_type)) {
    log.info({ type: event?.event_type }, 'ignoring an unhandled PayPal event');
    return NextResponse.json({ received: true });
  }

  /*
   * The order id sits in a different place depending on the event: an approved ORDER carries
   * its own id, where a completed CAPTURE carries the capture's id and points at the order
   * through a link. Reading both is what lets one handler serve both events.
   */
  const orderId =
    event?.resource?.id && event.event_type === 'CHECKOUT.ORDER.APPROVED'
      ? event.resource.id
      : (event?.resource?.supplementary_data?.related_ids?.order_id ?? null);

  if (!orderId) {
    log.warn({ type: event?.event_type }, 'PayPal event carried no order id');
    return NextResponse.json({ received: true });
  }

  const ctx = { ip: clientIp(request), userAgent: request.headers.get('user-agent') ?? '' };

  /*
   * Settlement runs inside after(), like the Paystack handler: the response is already
   * decided, and a serverless invocation ends when it is returned — unawaited work would be
   * killed mid-flight.
   */
  after(async () => {
    try {
      await connectDB();
      const result = await settlePaypalOrder(orderId, ctx);
      log.info({ orderId, ...result }, 'PayPal event processed');
    } catch (error) {
      // Message only: never the event body, which carries payer details.
      log.error({ orderId, message: error.message }, 'PayPal settlement failed');
    }
  });

  return NextResponse.json({ received: true });
}
