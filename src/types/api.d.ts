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
  /**
   * REJECTED, NOT CLAMPED, above the route's ceiling — zod's `.max()` refuses the request
   * rather than trimming it, so an over-large limit is a 400 and not a short page. This
   * comment used to say "clamped", which is how the overview came to ask for 1000 rows
   * against a cap of 100 and silently draw no charts at all for weeks.
   *
   * The ceiling is PAGINATION.MAX_LIMIT (100) on every list route but one: the metrics
   * series allows 1000, because a chart needs its whole window and a metric row holds no
   * person. See the note in `api/v1/reports/metrics/route.js`.
   */
  limit?: number;
  /** Mongoose sort string, e.g. `-createdAt`. */
  sort?: string;
}
