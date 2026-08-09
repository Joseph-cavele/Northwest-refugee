import { after, NextResponse } from 'next/server';
import logger from '@/server/config/logger';
import { connectDB } from '@/server/config/db';
import { verifyWebhookSignature } from '@/server/modules/payments/paystack.provider';
import { handlePaystackEvent } from '@/server/modules/payments/payment.service';
import { clientIp } from '@/server/http/route';

/*
 * Paystack's webhook.
 *
 * NOT wrapped in route(). This handler needs the RAW BYTES — the signature is an HMAC over
 * exactly what was sent, and any parse-then-re-serialise loses key order and whitespace and
 * makes the digest unreproducible. Under Express this was the reason payment.routes.js had
 * to be mounted above express.json(); here a Route Handler simply never parses a body it is
 * not asked to, so `await request.text()` is the whole of it. The ordering hazard is gone,
 * but the requirement it protected has not changed.
 *
 * The endpoint is public by necessity — Paystack holds no credentials of ours — so THE
 * SIGNATURE IS THE AUTHENTICATION. It is HMAC-SHA512, not SHA256; getting that wrong
 * rejects every legitimate notification.
 *
 * A valid signature proves who sent the message, never that its contents are true. Four
 * gates stand between a webhook and money counting: signature → known reference →
 * server-to-server verifyTransaction → amount and currency match. The last three are in
 * payment.service.js.
 */
export async function POST(request) {
  const raw = await request.text();
  const signature = request.headers.get('x-paystack-signature');

  if (!verifyWebhookSignature({ signature, rawBody: raw })) {
    // No detail in the response: an attacker probing this should learn nothing about why
    // it failed.
    logger.warn({ hasSignature: Boolean(signature) }, 'rejected an unsigned Paystack webhook');
    return new NextResponse(null, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // A signed body that is not JSON is not something to retry — accept and drop it, or
    // Paystack will resend it every few minutes forever.
    logger.warn('Paystack webhook carried a valid signature but unparseable JSON');
    return new NextResponse(null, { status: 200 });
  }

  const ctx = { ip: clientIp(request), userAgent: 'paystack-webhook' };

  /*
   * ANSWER FIRST, PROCESS AFTER. Paystack expects a 200 within a few seconds and retries
   * otherwise; verification is a second network call, well over that budget.
   *
   * Express could keep working after res.sendStatus(200) because the process lived on. A
   * serverless invocation does not — returning the response is the end of it, and work
   * started but not awaited is killed mid-flight. `after()` is the supported way to keep a
   * task alive past the response, and it is load-bearing here rather than a tidy-up.
   *
   * settleDonation is idempotent, so a retry arriving while this is still working costs
   * nothing — which is what makes answering early safe at all.
   */
  after(async () => {
    try {
      // The connection is not guaranteed here: after() may run on an instance that has
      // done nothing else, and route()'s connectDB never ran for this handler.
      await connectDB();
      await handlePaystackEvent(payload, ctx);
    } catch (err) {
      // Never rethrow: the response has already gone, and an unhandled rejection would
      // take the instance down over one malformed notification.
      logger.error({ err }, 'Paystack webhook processing failed');
    }
  });

  return new NextResponse(null, { status: 200 });
}
