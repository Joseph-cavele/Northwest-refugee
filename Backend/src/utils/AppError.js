// Every error that leaves a controller is an AppError so errorHandler can emit a
// single stable shape: { error: { code, message, details? } }. The frontend switches
// on `code`, never on message text — so codes here are part of the API contract.

export const CODES = Object.freeze({
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  // Distinct from FORBIDDEN so the dashboard can explain *why* an approve button failed
  // — "you created this" is a different conversation from "you lack the permission".
  SELF_APPROVAL: 'SELF_APPROVAL',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL: 'INTERNAL',
});

const STATUS_BY_CODE = Object.freeze({
  [CODES.VALIDATION_FAILED]: 422,
  [CODES.BAD_REQUEST]: 400,
  [CODES.UNAUTHORIZED]: 401,
  [CODES.FORBIDDEN]: 403,
  [CODES.SELF_APPROVAL]: 403,
  [CODES.NOT_FOUND]: 404,
  [CODES.CONFLICT]: 409,
  [CODES.TOO_MANY_REQUESTS]: 429,
  [CODES.INTERNAL]: 500,
});

export class AppError extends Error {
  /**
   * @param {string} code     one of CODES
   * @param {string} message  human-readable, safe to show the client
   * @param {object} [details] field-keyed map for VALIDATION_FAILED; omitted otherwise
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'AppError';
    this.code = code in STATUS_BY_CODE ? code : CODES.INTERNAL;
    this.statusCode = STATUS_BY_CODE[this.code];
    this.details = details;
    // Distinguishes expected, client-facing failures from programmer errors/crashes,
    // so errorHandler can safely surface the message instead of hiding it.
    this.isOperational = true;
    Error.captureStackTrace?.(this, AppError);
  }
}

// Factories — the only sanctioned way to raise HTTP errors (rule 5).
AppError.badRequest = (message = 'Bad request', details) =>
  new AppError(CODES.BAD_REQUEST, message, details);

AppError.validationFailed = (details, message = 'Validation failed') =>
  new AppError(CODES.VALIDATION_FAILED, message, details);

AppError.unauthorized = (message = 'Authentication required') =>
  new AppError(CODES.UNAUTHORIZED, message);

AppError.forbidden = (message = 'You do not have permission to do that') =>
  new AppError(CODES.FORBIDDEN, message);

// Takes the resource, not a sentence: AppError.notFound('Beneficiary').
AppError.notFound = (resource = 'Resource') =>
  new AppError(CODES.NOT_FOUND, `${resource} not found`);

// Maker-checker. Raised by finance.service.js, never by a role table — the role table
// says who may approve, this says they may not approve *this one*.
AppError.selfApproval = (message = 'You cannot approve something you created') =>
  new AppError(CODES.SELF_APPROVAL, message);

AppError.conflict = (message = 'Conflict', details) =>
  new AppError(CODES.CONFLICT, message, details);

AppError.tooManyRequests = (message = 'Too many requests, please slow down') =>
  new AppError(CODES.TOO_MANY_REQUESTS, message);

AppError.internal = (message = 'Something went wrong') =>
  new AppError(CODES.INTERNAL, message);

export default AppError;
