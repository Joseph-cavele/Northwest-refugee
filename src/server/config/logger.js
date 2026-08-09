import pino from 'pino';
import env from './env.js';

// Logs are the easiest place for a permit number to escape this system: they are shipped
// to third parties, kept longer than the database, and read by people who were never
// granted `beneficiary:read_sensitive`. Two controls work together here —
//
//   1. serializers, which decide what is *eligible* to be logged at all, and
//   2. the redact list, which censors anything sensitive that slips through anyway.
//
// The serializers are the real defence. Redaction only catches what it can name, and it
// cannot reach inside a URL or a free-text message.

// ADD TO THIS LIST whenever you add a field carrying personal information.
// pino matches these paths literally: `*.x` matches x exactly one level deep — it is not
// recursive — so a deeper shape needs its own entry.
const REDACT_PATHS = [
  // Credentials and tokens
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'mfaSecret',
  '*.mfaSecret',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'otp',
  '*.otp',
  'signature',
  '*.signature',

  // Special personal information (POPIA s26) — never legible in a log line.
  'permitNumber',
  '*.permitNumber',
  'immigration.permitNumber',
  '*.immigration.permitNumber',
  'permitNumberBlindIndex',
  '*.permitNumberBlindIndex',
  'idNumber',
  '*.idNumber',
  'vulnerabilityFlags',
  '*.vulnerabilityFlags',

  // Contact details identify a beneficiary as surely as a name does.
  'phone',
  '*.phone',
  'cellphone',
  '*.cellphone',
  'contact.cellphone',
  '*.contact.cellphone',
  'whatsappNumber',
  '*.whatsappNumber',
  'email',
  '*.email',
];

// Header allowlist, not a blocklist. A blocklist silently starts logging the next header
// some middleware decides to add; this cannot.
const SAFE_HEADERS = ['content-type', 'content-length', 'user-agent', 'referer'];

function pickHeaders(headers = {}) {
  const out = {};
  for (const name of SAFE_HEADERS) {
    if (headers[name] !== undefined) out[name] = headers[name];
  }
  return out;
}

/**
 * Serializers run against the *raw* Node req/res — pass `wrapSerializers: false` to
 * pino-http so it does not hand us its own pre-shaped object instead.
 */
export const serializers = {
  err: pino.stdSerializers.err,

  req(req) {
    const [path, queryString] = String(req.url ?? '').split('?');
    return {
      id: req.id,
      method: req.method,
      // Path only. A query string like `?phone=%2B2782...` puts a beneficiary's number
      // in the log line, and no redact path can reach inside a URL string.
      path,
      // Names of the filters used, never their values — enough to debug a bad query
      // without recording who was searched for.
      queryKeys: queryString ? [...new URLSearchParams(queryString).keys()] : undefined,
      ip: req.socket?.remoteAddress,
      headers: pickHeaders(req.headers),
    };
  },

  res(res) {
    return {
      statusCode: res.statusCode,
      contentLength: res.getHeader?.('content-length'),
    };
  },
};

const logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  // Tests stay silent so a failing assertion is not buried in boot output.
  enabled: env.NODE_ENV !== 'test',
  base: { env: env.NODE_ENV },
  serializers,
  formatters: {
    // `level: "info"` reads better in Render/Datadog than pino's numeric default.
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Tag log lines with their origin: loggerFor('finance.service') makes it possible to
 * filter one module's output without grepping message text.
 */
export function loggerFor(module) {
  return logger.child({ module });
}

/**
 * Audit-adjacent events that must stay legible even when the level is raised in
 * production. Use for consent, verification, approvals and document access — the things
 * an auditor asks about. This never replaces an AuditLog entry; it only makes the same
 * event findable in the log stream.
 */
export function logSecurityEvent(event, fields = {}) {
  logger.warn({ securityEvent: event, ...fields }, `security: ${event}`);
}

export { REDACT_PATHS, SAFE_HEADERS };
export default logger;
