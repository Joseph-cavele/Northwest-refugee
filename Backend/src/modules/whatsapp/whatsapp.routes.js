import { Router } from 'express';
import logger from '../../config/logger.js';
import { rawBody } from '../../middleware/rawBody.js';
import {
  verifySignature,
  verifyWebhookChallenge,
  extractMessages,
  extractFailedStatuses,
} from './whatsapp.client.js';
import { handleMessage, respond } from './bot.service.js';

// Meta's inbound webhook.
//
// MOUNTED ABOVE express.json() IN app.js. Meta signs the raw body bytes, so the global
// JSON parser would consume the stream and leave nothing to verify against. rawBody throws
// loudly if that ordering is ever broken.
//
// The endpoint is public by necessity — Meta holds no credentials of ours — so the
// signature IS the authentication.
//
// There is no separate delivery-status route: unlike a per-callback provider, the Cloud
// API sends messages and receipts through this one hook, distinguished by which key the
// payload carries.

const router = Router();

/**
 * The verification handshake Meta performs when the webhook URL is saved in the app
 * dashboard, and re-runs occasionally afterwards.
 *
 * The challenge must be echoed back as PLAIN TEXT. Wrapping it in this API's usual JSON
 * envelope fails verification, and the dashboard reports only a generic error — which is
 * a long afternoon if you do not already know to look here.
 */
router.get('/webhook', (req, res) => {
  const challenge = verifyWebhookChallenge({
    mode: req.query['hub.mode'],
    token: req.query['hub.verify_token'],
    challenge: req.query['hub.challenge'],
  });

  if (challenge === null) {
    logger.warn('rejected a WhatsApp webhook verification attempt');
    return res.sendStatus(403);
  }

  return res.status(200).type('text/plain').send(String(challenge));
});

router.post('/webhook', rawBody(), async (req, res) => {
  const signature = req.get('x-hub-signature-256');

  if (!verifySignature({ signature, rawBody: req.rawBody })) {
    // No detail in the response: an attacker probing this should learn nothing about why
    // it failed.
    logger.warn({ hasSignature: Boolean(signature) }, 'rejected an unsigned WhatsApp webhook');
    return res.sendStatus(403);
  }

  // Answer Meta first. A non-200 is retried with backoff, and classification can take
  // seconds — holding the request open risks a timeout and a duplicate delivery. Replies
  // go out over the Graph API once the work is done.
  res.sendStatus(200);

  for (const failure of extractFailedStatuses(req.body)) {
    logger.warn(failure, 'WhatsApp message not delivered');
  }

  const ctx = { ip: req.ip, userAgent: 'whatsapp-cloud-api' };

  // A single webhook call can carry more than one message. Handled in sequence rather than
  // in parallel: two messages from the same person are two steps of one conversation, and
  // running them concurrently would race on the same session document.
  for (const message of extractMessages(req.body)) {
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
      // Never rethrow: the response has already gone, and an unhandled rejection here
      // would take the process down over one malformed message.
      logger.error({ err }, 'WhatsApp webhook processing failed');
    }
  }
});

export default router;
