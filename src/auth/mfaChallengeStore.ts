/*
 * The MFA challenge token, in memory, for exactly one navigation.
 *
 * WHY THIS FILE EXISTS AT ALL. Under React Router the token travelled as router state:
 * `navigate(PATHS.mfa, { state: { challengeToken } })`. Next's App Router has no state
 * channel across a navigation — the options are the URL, storage, or memory.
 *
 * The URL is out. A challenge token is a bearer credential for the second half of a
 * sign-in; in a query string it lands in browser history, in the Referer header on every
 * subsequent request, and in the access log of anything in between. On a shared front-desk
 * machine, history alone is enough.
 *
 * Storage is out for the same reason the access token is not in storage: localStorage and
 * sessionStorage are blocked by an eslint rule, because an XSS that can read them is an
 * XSS that can complete a sign-in against a system holding minors' identity documents.
 *
 * So: a module variable, mirroring auth/tokenStore.ts. It does not survive a reload, which
 * is correct — a reload on the MFA screen should send you back to sign in rather than
 * silently resume a half-finished authentication.
 */

let challengeToken: string | null = null;

export function setMfaChallenge(token: string): void {
  challengeToken = token;
}

/**
 * Read the token and clear it in one move.
 *
 * Single-use on purpose: the challenge is spent by the verify call, and leaving it
 * readable afterwards means a Back navigation onto the MFA screen finds a live credential
 * still sitting in memory.
 */
export function takeMfaChallenge(): string | null {
  const token = challengeToken;
  challengeToken = null;
  return token;
}

/** Whether a challenge is pending, without consuming it — for a guard that only checks. */
export function hasMfaChallenge(): boolean {
  return challengeToken !== null;
}

export function clearMfaChallenge(): void {
  challengeToken = null;
}
