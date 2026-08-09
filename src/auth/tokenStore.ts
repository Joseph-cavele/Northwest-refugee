/*
 * The access token, in memory.
 *
 * A module variable, not React state and not storage:
 *
 *  - NOT localStorage or sessionStorage. Persisting it is the one mistake that turns
 *    any XSS into a stolen session on a system holding minors' identity documents.
 *    `eslint.config.js` blocks both globals so this cannot be undone by accident.
 *  - NOT React state alone, because `api/client.ts` needs to read the current token on
 *    every request and cannot call a hook.
 *
 * Losing the token on refresh is intentional and costs nothing: the httpOnly refresh
 * cookie survives, and AuthProvider trades it for a new access token on boot. If a
 * "stay signed in" bug ever lands on your desk, the fix is that call — never storage.
 *
 * The refresh token itself never appears here. It is httpOnly and scoped to
 * /api/v1/auth, so JavaScript cannot read it at all. That is the point.
 */

let accessToken: string | null = null;

/** Called when a refresh attempt fails, i.e. the session is genuinely over. */
type ExpiryHandler = () => void;
let onExpired: ExpiryHandler | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}

/**
 * Register what happens when the session cannot be renewed.
 *
 * AuthProvider owns this. It lives here rather than in the client so the fetch layer
 * can report expiry without importing React or the router.
 */
export function setExpiryHandler(handler: ExpiryHandler | null): void {
  onExpired = handler;
}

export function notifyExpired(): void {
  accessToken = null;
  onExpired?.();
}
