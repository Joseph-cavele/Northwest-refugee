import AppError from '../utils/AppError.js';

// Two layers of input hygiene, in order:
//   sanitizeRequest — strips structurally dangerous keys from every request;
//   validate        — enforces a zod schema per route.
// The first is global and blunt, the second is per-route and exact. Neither replaces
// the other: sanitize runs before any route knows what shape it wants.

// --- NoSQL-injection guard ------------------------------------------------------
// Keys starting with '$' are Mongo operators ($gt, $where); keys containing '.' are
// dotted-path injection; '__proto__' is prototype pollution.
//
// express-mongo-sanitize cannot be used here — it reassigns req.query, which is
// getter-only on Express 5 and throws.

const FORBIDDEN_KEY = /^\$|\.|^__proto__$/;

function scrub(value) {
  if (Array.isArray(value)) {
    for (const item of value) scrub(item);
    return;
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
}

/**
 * Clean req.body and req.params, which are real writable properties.
 *
 * req.query is deliberately NOT scrubbed: on Express 5 it is a getter that reparses on
 * every access, so deletions never persist. Query safety comes from each route's zod
 * schema instead, which strips unknown keys and coerces types.
 */
export function sanitizeRequest(req, _res, next) {
  scrub(req.body);
  scrub(req.params);
  next();
}

// --- Schema validation ----------------------------------------------------------

const PARTS = ['body', 'params', 'query'];

/**
 * validate({ body, params, query }) — run each zod schema against its request part.
 *
 * On success the *parsed* (coerced, stripped) data replaces the source — except query:
 * Express 5's req.query is getter-only, so parsed query lands on req.validatedQuery.
 *
 * On failure every field error across all parts is collected into one VALIDATION_FAILED
 * with `details` keyed by field name, so the frontend can map straight onto form fields
 * instead of showing one error at a time.
 */
export function validate(schemas = {}) {
  return function validator(req, _res, next) {
    const details = {};

    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const field = issue.path.length ? issue.path.join('.') : part;
          if (!(field in details)) details[field] = issue.message;
        }
        continue;
      }

      if (part === 'query') {
        req.validatedQuery = result.data;
      } else {
        req[part] = result.data;
      }
    }

    if (Object.keys(details).length > 0) {
      return next(AppError.validationFailed(details));
    }
    next();
  };
}
