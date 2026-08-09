import { ApiError } from './errors';
import { getAccessToken, notifyExpired, setAccessToken } from '@/auth/tokenStore';
import type { ApiErrorCode } from '@/types/api';

/*
 * The one place a request leaves this app.
 *
 * Every response in the API is `{ success, data, meta? }` or
 * `{ success: false, error, requestId }` — there are no bare payloads — so unwrapping
 * belongs here rather than at each call site. Callers get `data` or an ApiError.
 *
 * This layer also owns the access token and the silent 401 retry, reading both through
 * `auth/tokenStore` — a plain module, so nothing here needs React.
 */

/*
 * Always same-origin now.
 *
 * Under Vite this read VITE_API_BASE_URL and relied on a dev proxy to keep the httpOnly
 * refresh cookie same-origin. In the Next app the API *is* this origin — /api/v1/** are
 * Route Handlers in this same deployment — so there is no base URL to configure and no
 * cross-origin case to get wrong. `credentials: 'include'` below is now belt-and-braces
 * rather than load-bearing, and is kept because removing it would silently break the
 * cookie if the API were ever split back out.
 */
const BASE = '';
const PREFIX = '/api/v1';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Serialised as JSON. Omit for GET. */
  body?: unknown;
  /** Appended as a query string; null/undefined entries are dropped. */
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  /**
   * Skip the Bearer header and the 401 retry. For the credential endpoints themselves —
   * login, refresh, accept-invite — where there is no session yet and a retry loop is
   * the last thing anyone wants.
   */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${BASE}${PREFIX}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // Skipped rather than stringified: `?status=undefined` is a filter the server will
    // reject, and an empty filter is not the same as no filter.
    if (value === null || value === undefined || value === '') continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/** Shape of the error envelope, narrowed from `unknown` before we trust any of it. */
function readErrorEnvelope(body: unknown, status: number): ApiError {
  if (body && typeof body === 'object' && 'error' in body) {
    const { error, requestId } = body as {
      error?: { code?: string; message?: string; details?: Record<string, string> };
      requestId?: string;
    };
    if (error?.code && error.message) {
      return new ApiError(error.code as ApiErrorCode, error.message, {
        details: error.details,
        requestId: requestId ?? '',
        status,
      });
    }
  }
  return ApiError.unexpected(status);
}

/*
 * Access tokens are short-lived, so a 401 mid-session is routine rather than
 * exceptional: the token expired while the tab was open. The fix is to spend the
 * refresh cookie for a new one and replay the request, which the user never sees.
 *
 * Single-flight. A dashboard fires several requests at once, and without this every
 * one of them would refresh on expiry. That is not merely wasteful — the server
 * rotates the refresh token on each use and revokes the whole family if an already
 * rotated one is presented, so a burst of parallel refreshes looks exactly like a
 * stolen token and signs the user out of every device.
 */
let inFlightRefresh: Promise<string | null> | null = null;

/**
 * Spend the refresh cookie for a new access token. Returns null if the session is over.
 *
 * Exported because AuthProvider needs exactly this on boot, and it must be the *same*
 * single-flight promise. Under StrictMode the boot effect runs twice; two concurrent
 * calls would both present the same cookie, the second would look like a replay of an
 * already-rotated token, and the server would revoke the entire family — signing the
 * user out of every device on page load.
 */
export async function refreshSession(): Promise<string | null> {
  /*
   * Called with raw fetch rather than through `request()`. Going through the client
   * would recurse straight back into this function on a failed refresh, and importing
   * auth.api.ts here would make the two modules circular.
   */
  inFlightRefresh ??= (async () => {
    try {
      const res = await fetch(`${BASE}${PREFIX}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const payload: unknown = await res.json().catch(() => null);
      const token = (payload as { data?: { accessToken?: string } })?.data?.accessToken;
      return token ?? null;
    } catch {
      return null;
    } finally {
      // Cleared before any awaiting caller resumes, so the next 401 starts a new attempt
      // rather than reusing this one's settled result.
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

async function send(
  path: string,
  options: RequestOptions,
  token: string | null
): Promise<Response> {
  const { method = 'GET', body, query, signal } = options;

  try {
    return await fetch(buildUrl(path, query), {
      method,
      signal,
      /*
       * The refresh token is an httpOnly cookie scoped to /api/v1/auth. Without this it
       * is neither stored nor sent, and every refresh fails as "missing refresh token"
       * — which surfaces as users being logged out at random.
       */
      credentials: 'include',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (err) {
    // An aborted request is the caller unmounting, not a failure — let it propagate so
    // effects can ignore it instead of rendering "check your connection" on a dead view.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw ApiError.network();
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  // 204 carries no body; parsing it would throw on valid success.
  if (res.status === 204) return undefined as T;

  const payload: unknown = await res.json().catch(() => null);

  if (res.ok && payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }

  throw readErrorEnvelope(payload, res.status);
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const anonymous = options.anonymous ?? false;
  const res = await send(path, options, anonymous ? null : getAccessToken());

  if (res.status !== 401 || anonymous) return unwrap<T>(res);

  const token = await refreshSession();
  if (!token) {
    /*
     * The refresh cookie is gone, expired, or was revoked. Tell the auth context so it
     * can clear the session and route to sign-in — then surface the original 401, so a
     * caller awaiting this does not sit on a promise that never settles.
     */
    notifyExpired();
    return unwrap<T>(res);
  }

  setAccessToken(token);
  return unwrap<T>(await send(path, options, token));
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
};
