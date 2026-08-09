import { loggerFor } from '../../config/logger.js';
import { dashboardForRole } from '../../config/constants.js';
import { signAccessToken, setRefreshCookie } from '../../utils/tokens.js';
import { issueRefreshToken } from './auth.service.js';
import { success } from '../../http/respond.js';

/*
 * The pieces auth.controller.js kept as module-private helpers, extracted so every route
 * that completes a sign-in shares them.
 *
 * Under Express these lived beside the handlers in one controller file. The App Router
 * puts each endpoint in its own file, so login, MFA verify and invite acceptance would
 * otherwise each grow their own copy of "sign a token, issue a refresh cookie, shape the
 * payload" — and three copies of a session handshake is how one of them ends up missing
 * the cookie.
 */

const log = loggerFor('auth.session');

/**
 * Send an action email without letting a provider outage change the outcome of the
 * request.
 *
 * A throw here used to propagate: an invite would create the account and the token, then
 * 500 — leaving an account nobody knew existed and an inviter who believed it failed. On
 * the reset path it was worse than untidy: only a KNOWN address reaches the provider, so a
 * 500 there versus a 200 for an unknown address is an account-enumeration oracle.
 */
export async function trySend(send, meta) {
  try {
    await send();
    return true;
  } catch (err) {
    log.error({ err, ...meta }, 'action email failed to send');
    return false;
  }
}

/**
 * The body every completed sign-in returns.
 *
 * `dashboard` is where the app should land this person — a convenience so the client does
 * not keep its own copy of the role-to-route table and drift out of step with the server.
 * It is NOT an authorisation decision: each dashboard's data is still fetched through
 * permission-guarded routes, so editing this value client-side buys a different empty
 * screen and a string of 403s.
 */
export function authPayload(user, accessToken) {
  return { user, accessToken, dashboard: dashboardForRole(user.role) };
}

/**
 * Complete a sign-in: mint an access token, issue a rotating refresh token, and return the
 * response with the cookie already attached.
 *
 * THE COOKIE IS SET ON THE RESPONSE, NOT ON A `res` OBJECT. That is the whole difference
 * from the Express version, and the reason this returns the response rather than a token:
 * a handler that built its own response afterwards would drop the Set-Cookie header, and
 * the symptom is a user who signs in successfully and is signed out on the next reload.
 */
export async function establishSession(user, ctx, { status = 200 } = {}) {
  const accessToken = signAccessToken(user);
  const { rawToken } = await issueRefreshToken(user, ctx);

  const response = success(authPayload(user, accessToken), { status });
  return setRefreshCookie(response, rawToken);
}
