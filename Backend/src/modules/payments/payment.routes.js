import { Router } from 'express';
import logger from '../../config/logger.js';
import { rawBody } from '../../middleware/rawBody.js';
import { verifyWebhookSignature } from './paystack.provider.js';
import { handlePaystackEvent } from './payment.service.js';

// Paystack's webhook.
//
// MOUNTED ABOVE express.json() IN app.js. The signature is an HMAC over the raw body
// bytes; once the global parser has read and re-serialised the JSON, key order and
// whitespace are gone and the digest can no longer be reproduced. rawBody throws loudly if
// that ordering is ever broken.
//
// The endpoint is public by necessity — Paystack holds no credentials of ours — so the
// signature IS the authentication. Everything after it is in payment.service.js.

const router = Router();

router.post('/paystack', rawBody(), async (req, res) => {
  const signature = req.get('x-paystack-signature');

  if (!verifyWebhookSignature({ signature, rawBody: req.rawBody })) {
    // No detail in the response: an attacker probing this should learn nothing about why
    // it failed.
    logger.warn({ hasSignature: Boolean(signature) }, 'rejected an unsigned Paystack webhook');
    return res.sendStatus(401);
  }

  // Answer immediately. Paystack expects a 200 within a few seconds and retries otherwise;
  // verification is a second network call, which is well over that budget. Processing
  // continues after the response — settleDonation is idempotent, so a retry that arrives
  // while this is still working costs nothing.
  res.sendStatus(200);

  try {
    await handlePaystackEvent(req.body, { ip: req.ip, userAgent: 'paystack-webhook' });
  } catch (err) {
    // Never rethrow: the response has already gone, and an unhandled rejection here would
    // take the process down over one malformed notification.
    logger.error({ err }, 'Paystack webhook processing failed');
  }
});

export default router;
