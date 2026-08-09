import mongoose from 'mongoose';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import env from '../config/env.js';
import logger from '../config/logger.js';
import AppError, { CODES } from '../utils/AppError.js';
import { REQUEST_ID_HEADER } from './respond.js';

/*
 * Turns any thrown value into the single error envelope:
 *   { success: false, error: { code, message, details? }, requestId }
 *
 * Ported from middleware/errorHandler.js with the mapping table unchanged — those cases
 * are the API's contract, not Express plumbing. What changed is the shape: Express
 * detected an error handler by its four-argument arity and wrote to `res`; here `route()`
 * catches and this returns a Response.
 *
 * Keeping this the ONLY place that formats an error is what lets "never build an error
 * response inline" hold everywhere else, exactly as it did before.
 */

// Reduce a ZodError into a field-keyed details map.
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

/** Map known library errors onto an AppError; null means genuinely unexpected. */
export function normalize(err) {
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

  return null;
}

/**
 * @param {unknown} err
 * @param {{ requestId: string, method?: string, path?: string }} ctx
 */
export function toErrorResponse(err, { requestId, method, path }) {
  const appError = normalize(err);
  const headers = { [REQUEST_ID_HEADER]: requestId };

  if (!appError) {
    /*
     * Unexpected/programmer error: log the real thing server-side, tell the client
     * nothing. The message could name a database field or a file path, so it never leaves
     * the server.
     */
    logger.error({ err, requestId, method, path }, 'unhandled error');
    const body = {
      success: false,
      error: { code: CODES.INTERNAL, message: 'Something went wrong' },
      requestId,
    };
    if (env.NODE_ENV !== 'production') body.error.stack = err?.stack;
    return NextResponse.json(body, { status: 500, headers });
  }

  const body = {
    success: false,
    error: { code: appError.code, message: appError.message },
    requestId,
  };
  if (appError.details) body.error.details = appError.details;

  return NextResponse.json(body, { status: appError.statusCode, headers });
}
