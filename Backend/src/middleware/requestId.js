import { randomUUID } from 'node:crypto';

const HEADER = 'x-request-id';

// An inbound id is accepted only in this shape. The header is attacker-controlled on any
// public endpoint — the webhook routes especially — and it ends up in every log line for
// the request and in the error body returned to the client. Restricting it to an opaque
// token keeps three separate problems out:
//
//   - log forgery: a value containing quotes, braces or newlines that a downstream log
//     viewer splits into what looks like a separate entry;
//   - unbounded volume: 8 KB of header repeated on every request, written to disk;
//   - response reflection: arbitrary text echoed back in a header and a JSON body.
//
// Anything not matching gets a fresh UUID instead of being rejected — a malformed
// correlation hint is not worth failing a payment notification over.
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Stamp every request with an id and echo it back.
 *
 * Error bodies carry it (`{ success: false, error, requestId }`), so a beneficiary or a
 * donor can quote the id from a failure screen and support can find the exact log line —
 * without either of them having to describe personal details over the phone.
 *
 * The id is a correlation hint, never an authorisation or identity signal: a client can
 * choose it, and two requests can be made to share one. Nothing may branch on it.
 */
export function requestId(req, res, next) {
  const inbound = req.headers[HEADER];
  // A repeated header arrives as an array; take the first rather than joining, which
  // would produce a comma-separated value no upstream system would recognise.
  const candidate = Array.isArray(inbound) ? inbound[0] : inbound;

  const id = typeof candidate === 'string' && SAFE_ID.test(candidate) ? candidate : randomUUID();

  req.id = id;
  // Available to views and to any handler that has res but not req to hand.
  res.locals.requestId = id;
  res.setHeader(HEADER, id);
  next();
}

export { SAFE_ID as REQUEST_ID_PATTERN };
export default requestId;
