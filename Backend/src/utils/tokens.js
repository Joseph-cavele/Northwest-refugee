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

export function setRefreshCookie(res, rawToken) {
  res.cookie(REFRESH_COOKIE, rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    // 'lax' suits a same-site SPA. A frontend on a different site in production needs
    // 'none' + secure + CORS credentials.
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
    // A domain on localhost makes the browser drop the cookie, so it is omitted in dev
    // even when COOKIE_DOMAIN is configured.
    ...(env.NODE_ENV === 'production' && env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

export function readRefreshCookie(req) {
  return req.cookies?.[REFRESH_COOKIE];
}

export const TOKEN_CONSTANTS = Object.freeze({
  ACCESS_TOKEN_TTL,
  MFA_CHALLENGE_TTL,
  REFRESH_TOKEN_TTL_MS,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
});
