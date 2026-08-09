import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import AppError from './AppError.js';

// Stateless token primitives only. Anything that reads or writes a Session row is
// business logic and lives in modules/auth/auth.service.js — utils never touch models.
//
// Token strategy:
//  - Access token: short-lived JWT, held in SPA memory, sent as a Bearer header.
//  - Refresh token: opaque high-entropy string in an httpOnly cookie; only its SHA-256
//    hash is stored. Rotated on every use, with reuse detection.
//  - MFA challenge: short-lived JWT proving "password stage passed, MFA still owed".
//
// jsonwebtoken is CJS-only — a named import from it yields undefined.

const ACCESS_TOKEN_TTL = env.ACCESS_TOKEN_TTL;
const MFA_CHALLENGE_TTL = '5m';
const REFRESH_TOKEN_TTL_MS = env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;

const REFRESH_COOKIE = 'refresh_token';
// Must match where auth.routes is mounted in app.js. A mismatch means the browser never
// sends the cookie back and every refresh fails as "missing refresh token".
const REFRESH_COOKIE_PATH = '/api/v1/auth';

// --- Opaque tokens --------------------------------------------------------------

// 256+ bits of entropy, so a fast hash is sufficient to store it: brute-forcing the
// preimage is infeasible. bcrypt is reserved for low-entropy user passwords.
export function generateOpaqueToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// --- Access tokens --------------------------------------------------------------

export function signAccessToken(user) {
  // `typ` stops a token minted for one purpose being accepted for another.
  // `tv` (token version) lets a password reset invalidate every outstanding access token.
  return jwt.sign({ typ: 'access', role: user.role, tv: user.tokenVersion ?? 0 }, env.JWT_SECRET, {
    subject: String(user._id),
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export function verifyAccessToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw AppError.unauthorized('Invalid or expired access token');
  }
  if (payload.typ !== 'access') throw AppError.unauthorized('Invalid access token');
  return payload;
}

// --- MFA challenge --------------------------------------------------------------

// Issued after a correct password when MFA is enabled; exchanged for real tokens once the
// TOTP code verifies.
export function issueMfaChallenge(user) {
  // A dedicated secret, so a challenge token can never be verified as an access token
  // even if one signing key leaks.
  return jwt.sign({ typ: 'mfa' }, env.JWT_CHALLENGE_SECRET, {
    subject: String(user._id),
    expiresIn: MFA_CHALLENGE_TTL,
  });
}

export function verifyMfaChallenge(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_CHALLENGE_SECRET);
  } catch {
    throw AppError.unauthorized('Invalid or expired MFA challenge');
  }
  if (payload.typ !== 'mfa') throw AppError.unauthorized('Invalid MFA challenge');
  return payload.sub;
}

// --- Refresh cookie -------------------------------------------------------------

/*
 * The refresh cookie.
 *
 * PORTED FROM EXPRESS. res.cookie()/res.clearCookie()/req.cookies came from cookie-parser
 * and do not exist on a Route Handler. Every attribute below is unchanged — httpOnly,
 * SameSite=Lax, the production-only Secure flag and the /api/v1/auth path — because they
 * are the security properties, not the plumbing.
 *
 * The path still has to match where the auth routes live (now app/api/v1/auth/**). A
 * mismatch means the browser never sends the cookie back and every refresh fails as
 * "missing refresh token".
 */

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    // 'lax' suits a same-origin app, which is what the Next port made this. The front end
    // and the API are now one origin, so 'none' is not needed and would be weaker.
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    // Next takes seconds where Express took milliseconds. Getting this wrong by a factor
    // of 1000 gives a cookie that expires in seconds and users who are signed out at random.
    maxAge: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
    // A domain on localhost makes the browser drop the cookie, so it is omitted in dev
    // even when COOKIE_DOMAIN is configured.
    ...(env.NODE_ENV === 'production' && env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

/** Set the cookie on an outgoing NextResponse. */
export function setRefreshCookie(response, rawToken) {
  response.cookies.set(REFRESH_COOKIE, rawToken, cookieOptions());
  return response;
}

/**
 * Clear it. Written as an empty value with maxAge 0 rather than .delete(): the attributes
 * must match the ones it was set with or the browser keeps the original cookie, and
 * .delete() does not carry the path.
 */
export function clearRefreshCookie(response) {
  response.cookies.set(REFRESH_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
  return response;
}

/** Read it off an incoming Request. */
export function readRefreshCookie(request) {
  return request.cookies?.get?.(REFRESH_COOKIE)?.value ?? parseCookieHeader(request)[REFRESH_COOKIE];
}

/**
 * Fallback for a plain Request, which has no .cookies — the test harness constructs those
 * directly rather than going through Next's router.
 */
function parseCookieHeader(request) {
  const header = request.headers?.get?.('cookie');
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((pair) => {
      const index = pair.indexOf('=');
      return index === -1
        ? [pair.trim(), '']
        : [pair.slice(0, index).trim(), decodeURIComponent(pair.slice(index + 1).trim())];
    })
  );
}

export const TOKEN_CONSTANTS = Object.freeze({
  ACCESS_TOKEN_TTL,
  MFA_CHALLENGE_TTL,
  REFRESH_TOKEN_TTL_MS,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
});
