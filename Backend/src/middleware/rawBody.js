import AppError from '../utils/AppError.js';

// Webhooks sign the raw request bytes. Paystack HMACs the raw JSON body, Meta does the
// same for WhatsApp callbacks, and a form-encoded gateway would sign the parameter string
// exactly as sent. Parse-then-re-serialise breaks all of them: key order
// is not guaranteed to survive, '+' and '%20' are interchangeable to a parser but not to a
// hash, and empty fields may be dropped entirely.
//
// So this middleware keeps the untouched bytes alongside a parsed view, and MUST be
// mounted above express.json() in app.js. Mounting it below leaves nothing to read,
// which is why that case throws loudly rather than verifying against a re-encoded body.

const DEFAULT_LIMIT_BYTES = 100 * 1024; // webhooks are small; anything larger is not ours

/**
 * Parse urlencoded input into ordered pairs. The order matters: a form-encoded gateway
 * computed over the fields in the sequence they arrived, so a plain object — which offers
 * no ordering guarantee for the general case — is not sufficient on its own.
 */
function parseUrlEncoded(text) {
  const pairs = [];
  for (const chunk of text.split('&')) {
    if (chunk === '') continue;
    const eq = chunk.indexOf('=');
    const rawKey = eq === -1 ? chunk : chunk.slice(0, eq);
    const rawValue = eq === -1 ? '' : chunk.slice(eq + 1);
    // '+' means space in form encoding; decodeURIComponent does not handle it.
    const decode = (s) => decodeURIComponent(s.replace(/\+/g, ' '));
    try {
      pairs.push([decode(rawKey), decode(rawValue)]);
    } catch {
      // A malformed escape sequence would throw. Keep the raw text rather than rejecting:
      // signature verification runs against rawBodyText anyway, and the gateway's own
      // validation call is the authority on what the payload means.
      pairs.push([rawKey, rawValue]);
    }
  }
  return pairs;
}

/**
 * Capture the untouched request body.
 *
 * Sets:
 *   req.rawBody      Buffer  — the exact bytes, for signature verification
 *   req.rawBodyText  string  — the same bytes as utf8
 *   req.rawBodyPairs Array   — [key, value] pairs in the order received (urlencoded only)
 *   req.body         object  — a convenience view; NEVER use it to build a signature
 */
export function rawBody({ limitBytes = DEFAULT_LIMIT_BYTES } = {}) {
  return function rawBodyMiddleware(req, _res, next) {
    // A body parser upstream has already drained the stream. Failing here is the point:
    // silently continuing would verify a signature against bytes we reconstructed
    // ourselves, which passes in testing and fails against the real gateway.
    if (req.body !== undefined || req.readableEnded) {
      return next(
        AppError.internal(
          'rawBody must be mounted before express.json() — the request stream was already consumed'
        )
      );
    }

    const chunks = [];
    let received = 0;
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAborted);
      next(err);
    };

    function onData(chunk) {
      received += chunk.length;
      if (received > limitBytes) {
        // Stop reading rather than buffering an unbounded payload from an unauthenticated
        // endpoint — webhook routes are public by necessity.
        req.pause();
        return finish(AppError.badRequest('Webhook payload too large'));
      }
      chunks.push(chunk);
    }

    function onEnd() {
      const buffer = Buffer.concat(chunks, received);
      req.rawBody = buffer;
      req.rawBodyText = buffer.toString('utf8');

      const contentType = String(req.headers['content-type'] ?? '');

      if (contentType.includes('application/json')) {
        try {
          req.body = req.rawBodyText.length ? JSON.parse(req.rawBodyText) : {};
        } catch {
          return finish(AppError.badRequest('Webhook payload is not valid JSON'));
        }
        req.rawBodyPairs = [];
        return finish();
      }

      // Default to form encoding, for any gateway that posts that way.
      const pairs = parseUrlEncoded(req.rawBodyText);
      req.rawBodyPairs = pairs;
      // Last value wins on a duplicate key, matching how the gateways document it.
      req.body = Object.fromEntries(pairs);
      return finish();
    }

    function onError(err) {
      finish(err);
    }

    function onAborted() {
      finish(AppError.badRequest('Webhook request aborted'));
    }

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
  };
}

export default rawBody;
