/*
 * The API envelope, as emitted by src/server/http/respond.js and
 * src/server/http/errors.js. Every response in the system is one of
 * these two shapes — there are no bare payloads.
 */

/** `meta` is present only on paginated lists. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiFailure {
  success: false;
  error: {
    code: ApiErrorCode;
    /** Human-readable and safe to show. Never switch on it — switch on `code`. */
    message: string;
    /**
     * Field-keyed, so a form can map errors straight onto its inputs. Present on
     * VALIDATION_FAILED and occasionally CONFLICT; absent otherwise.
     */
    details?: Record<string, string>;
    /** Non-production only. */
    stack?: string;
  };
  /** Echoed from `x-request-id`. Show it on a failure screen so support can find the log line. */
  requestId: string;
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

/**
 * From src/server/utils/AppError.js. Part of the API contract — the client switches
 * on these, never on message text.
 */
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  /** Maker-checker: "you created this" is a different conversation from "you lack the permission". */
  | 'SELF_APPROVAL'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL'
  /** Client-side only: the request never reached the server. */
  | 'NETWORK';

/** From src/server/utils/paginate.js. */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** What a list endpoint hands back once the envelope is unwrapped. */
export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Query parameters every paginated list route accepts. */
export interface ListQuery {
  page?: number;
  /** Clamped to PAGINATION.MAX_LIMIT server-side regardless of what is sent. */
  limit?: number;
  /** Mongoose sort string, e.g. `-createdAt`. */
  sort?: string;
}
