import type { ApiErrorCode } from '@/types/api';

/**
 * A failure that came back inside the API's error envelope, or a transport failure
 * shaped to look like one.
 *
 * Callers switch on `code`, never on `message` — the codes are a contract
 * (src/server/utils/AppError.js), the messages are copy and change freely.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  /** Field-keyed, so a form maps errors straight onto its inputs. Empty when absent. */
  readonly details: Record<string, string>;
  /** Echoed from `x-request-id`. Show it on a failure screen; support greps for it. */
  readonly requestId: string;
  readonly status: number;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: { details?: Record<string, string>; requestId?: string; status?: number } = {}
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = options.details ?? {};
    this.requestId = options.requestId ?? '';
    this.status = options.status ?? 0;
  }

  /** True when the server named specific fields, i.e. the form can render them inline. */
  get hasFieldErrors(): boolean {
    return Object.keys(this.details).length > 0;
  }

  /** The request never left the browser. Worth distinguishing: retrying may just work. */
  static network(): ApiError {
    return new ApiError('NETWORK', 'Could not reach the server. Check your connection.');
  }

  static unexpected(status: number): ApiError {
    return new ApiError('INTERNAL', `Unexpected response from the server (${status}).`, {
      status,
    });
  }
}

/**
 * Narrow an unknown catch value to something renderable.
 *
 * Every `catch` in the UI runs through this, so a TypeError thrown inside a `.then`
 * cannot reach a component as `undefined.message`.
 */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError('INTERNAL', 'Something went wrong. Please try again.');
}
