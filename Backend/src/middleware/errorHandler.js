import mongoose from 'mongoose';
import { ZodError } from 'zod';
import env from '../config/env.js';
import logger from '../config/logger.js';
import AppError, { CODES } from '../utils/AppError.js';

// Turns any thrown value into the single error envelope:
//   { success: false, error: { code, message, details? }, requestId }
// mirroring the success envelope in utils/apiResponse.js. Keeping this the *only* place
// that formats errors is what lets "never res.status().json() inline" hold everywhere else.
//
// requestId is echoed so a beneficiary or donor can quote the id from a failure screen and
// support can find the exact log line, without either of them describing personal details.

// Reduce a ZodError / Mongoose ValidationError into a field-keyed details map.
function zodDetails(err) {
  const details = {};
  for (const issue of err.issues) {
    const field = issue.path.length ? issue.path.join('.') : '_';
    if (!(field in details)) details[field] = issue.message;
  }
  return details;
}

function mongooseValidationDetails(err) {
  const details = {};
  for (const [field, e] of Object.entries(err.errors)) {
    details[field] = e.message;
  }
  return details;
}

// Map known library errors onto an AppError; unknown errors become a 500.
function normalize(err) {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return AppError.validationFailed(zodDetails(err));
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return AppError.validationFailed(mongooseValidationDetails(err));
  }

  if (err instanceof mongoose.Error.CastError) {
    return AppError.badRequest(`Invalid value for '${err.path}'`);
  }

  // Duplicate unique key.
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? 'field';
    return AppError.conflict(`A record with that ${field} already exists`);
  }

  if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
    return AppError.unauthorized('Invalid or expired token');
  }

  return null; // genuinely unexpected — caller emits a generic 500
}

// Express detects an error handler by its arity — the 4th arg (_next) must stay declared.
export function errorHandler(err, req, res, _next) {
  const appError = normalize(err);

  if (!appError) {
    // Unexpected/programmer error: log the real thing server-side, tell the client nothing.
    // The message could name a database field or a file path, so it never leaves the server.
    logger.error({ err, requestId: req.id }, 'unhandled error');
    const body = {
      success: false,
      error: { code: CODES.INTERNAL, message: 'Something went wrong' },
      requestId: req.id,
    };
    if (env.NODE_ENV !== 'production') body.error.stack = err?.stack;
    return res.status(500).json(body);
  }

  const body = {
    success: false,
    error: { code: appError.code, message: appError.message },
    requestId: req.id,
  };
  if (appError.details) body.error.details = appError.details;
  res.status(appError.statusCode).json(body);
}

// Terminal middleware for unmatched routes — hand a 404 to errorHandler for one consistent shape.
export function notFoundHandler(req, _res, next) {
  // Built directly rather than via AppError.notFound(), which names a resource.
  next(new AppError(CODES.NOT_FOUND, `Route not found: ${req.method} ${req.originalUrl}`));
}
