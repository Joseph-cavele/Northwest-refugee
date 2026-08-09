import { randomUUID } from 'node:crypto';
import AppError from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { hasPermission, assertKnownPermission } from '../config/permissions.js';
import { connectDB } from '../config/db.js';
import User from '../modules/users/user.model.js';
import AuditLog, { ACTIONS } from '../modules/audit/audit.model.js';
import { toErrorResponse } from './errors.js';
import { REQUEST_ID_HEADER } from './respond.js';

/*
 * The Express middleware chain, as one wrapper.
 *
 *   router.get('/', authenticate, authorize(P.CASE_READ), validate({ query }), catchAsync(fn))
 *
 * becomes
 *
 *   export const GET = route({ auth: true, permission: P.CASE_READ, query: schema }, fn)
 *
 * Same five jobs, same order, same failure shapes — requestId, authenticate, authorize,
 * validate, and the single error formatter. It is one function rather than five because
 * Route Handlers have no `next()` to chain through, and five hand-rolled wrappers would
 * be five chances to compose them in the wrong order on one route out of a hundred.
 *
 * Declaring the permission on the export is deliberate and is the property worth keeping
 * from the Express version: a route's guard is visible at the top of the file it guards,
 * and `assertKnownPermission` still runs at module load, so a typo is a boot-time error
 * rather than a route that silently denies everyone.
 */

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * An inbound id is accepted only in this shape. The header is attacker-controlled on any
 * public endpoint — the webhook routes especially — and it ends up in every log line and
 * in the error body returned to the client. See middleware/requestId.js in the Express
 * tree for the three problems this keeps out (log forgery, unbounded volume, reflection).
 */
function readRequestId(request) {
  const candidate = request.headers.get(REQUEST_ID_HEADER);
  return typeof candidate === 'string' && SAFE_ID.test(candidate) ? candidate : randomUUID();
}

function bearerToken(request) {
  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

/**
 * Load the staff user behind a Bearer access token. Anything but an active account is
 * rejected, so a disabled user is locked out the moment their next request lands rather
 * than when their token happens to expire.
 */
async function loadUser(token) {
  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') {
    throw AppError.unauthorized('Account is not active');
  }
  // Reject tokens minted before the last password reset or forced logout-all.
  if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
    throw AppError.unauthorized('Session expired, please sign in again');
  }
  return user;
}

/**
 * The caller's IP, for audit rows and rate-limit buckets.
 *
 * Express gave us `req.ip`, derived from `trust proxy: 1` — one reverse-proxy hop. There
 * is no such setting here, so the equivalent is the FIRST entry of x-forwarded-for, which
 * is the client as seen by the closest proxy. Anything further left in that list is
 * client-supplied and must never be trusted; taking the last entry would bucket the whole
 * internet behind the proxy's own address.
 */
function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? '';
}

async function parseBody(request) {
  const type = request.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return undefined;
  try {
    return await request.json();
  } catch {
    throw AppError.badRequest('Request body is not valid JSON');
  }
}

/*
 * NoSQL-injection guard, ported from middleware/validate.js sanitizeRequest.
 *
 * Keys starting with '$' are Mongo operators ($gt, $where); keys containing '.' are
 * dotted-path injection; '__proto__' is prototype pollution. Runs before zod because it
 * is structural: a schema that happens to allow a passthrough object would otherwise let
 * one through.
 */
const FORBIDDEN_KEY = /^\$|\.|^__proto__$/;

function scrub(value) {
  if (Array.isArray(value)) {
    for (const item of value) scrub(item);
    return value;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEY.test(key)) {
        delete value[key];
        continue;
      }
      scrub(value[key]);
    }
  }
  return value;
}

/**
 * Query string → plain object, keeping repeated keys as arrays.
 *
 * `?key=a&key=b` has to survive as `['a','b']` — the metrics series reads several keys at
 * once, and Object.fromEntries(searchParams) would silently keep only the last.
 */
function readQuery(url) {
  const out = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

function validatePart(schema, value, details, part) {
  if (!schema) return value;
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  for (const issue of result.error.issues) {
    const field = issue.path.length ? issue.path.join('.') : part;
    if (!(field in details)) details[field] = issue.message;
  }
  return undefined;
}

/**
 * @typedef {object} RouteOptions
 * @property {boolean} [auth]        require a signed-in user (401 otherwise)
 * @property {boolean} [optionalAuth] attach the user when a token is present, never block
 * @property {string}  [permission]  require a permission (implies auth); denials are audited
 * @property {import('zod').ZodTypeAny} [body]
 * @property {import('zod').ZodTypeAny} [query]
 * @property {import('zod').ZodTypeAny} [params]
 * @property {boolean} [raw]         skip JSON parsing — the handler reads the raw bytes
 *                                   itself, for webhooks that HMAC what was actually sent
 */

/**
 * Wrap a handler with the request pipeline.
 *
 * The handler receives one object: `{ request, user, body, query, params, ctx, requestId }`.
 * `ctx` is `{ ip, userAgent }`, the same shape every service already takes for audit.
 */
export function route(options, handler) {
  const { auth = false, optionalAuth = false, permission, body: bodySchema, query: querySchema, params: paramsSchema, raw = false } = options ?? {};

  // Wire-up check, exactly as authorize() did at module load under Express: a typo would
  // otherwise deny everyone silently and look like a broken login.
  if (permission) assertKnownPermission(permission);

  return async function handle(request, context) {
    const requestId = readRequestId(request);
    const url = new URL(request.url);

    try {
      // Every handler needs the database, and there is no boot step to have opened it.
      // Cached and single-flight — see config/db.js.
      await connectDB();

      let user = null;
      const token = bearerToken(request);

      if (auth || permission) {
        if (!token) throw AppError.unauthorized();
        user = await loadUser(token);
      } else if (optionalAuth && token) {
        // For endpoints that behave differently signed-in vs anonymous — logout being the
        // obvious one. A bad token is ignored rather than fatal: the route works either way.
        try {
          user = await loadUser(token);
        } catch {
          user = null;
        }
      }

      const ctx = { ip: clientIp(request), userAgent: request.headers.get('user-agent') ?? '' };

      if (permission && !hasPermission(user.role, permission)) {
        // Audited before the 403, because a pattern of refusals is itself a security signal.
        await AuditLog.record({
          actor: user._id,
          action: ACTIONS.PERMISSION_DENIED,
          status: 'failure',
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          meta: { permission, method: request.method, path: url.pathname },
        });
        throw AppError.forbidden();
      }

      // Next 15+ hands route params as a promise, so this await is required, not defensive.
      const rawParams = context?.params ? await context.params : {};

      const details = {};
      const parsedParams = validatePart(paramsSchema, scrub({ ...rawParams }), details, 'params');
      const parsedQuery = validatePart(querySchema, readQuery(url), details, 'query');
      const parsedBody = raw
        ? undefined
        : validatePart(bodySchema, scrub(await parseBody(request)), details, 'body');

      // Every field error across all three parts in one response, so a form can map them
      // onto its inputs instead of showing one at a time.
      if (Object.keys(details).length > 0) throw AppError.validationFailed(details);

      const response = await handler({
        request,
        user,
        ctx,
        requestId,
        params: parsedParams ?? rawParams,
        query: parsedQuery,
        body: parsedBody,
      });

      // Handlers build their response through respond.js, which does not know the
      // requestId. Stamped here so every response carries it, success or failure.
      if (response && !response.headers.get(REQUEST_ID_HEADER)) {
        response.headers.set(REQUEST_ID_HEADER, requestId);
      }
      return response;
    } catch (err) {
      return toErrorResponse(err, { requestId, method: request.method, path: url.pathname });
    }
  };
}

export { clientIp, readRequestId };
export default route;
