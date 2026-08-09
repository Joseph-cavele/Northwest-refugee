import { generateSecret, generateURI, verifySync } from 'otplib';
import env from '../../config/env.js';
import AppError from '../../utils/AppError.js';
import { generateOpaqueToken, hashToken } from '../../utils/tokens.js';
import { Session } from './otp.model.js';

// Everything here touches the Session model or an MFA secret — the stateless JWT and
// cookie primitives live in utils/tokens.js.

const REFRESH_TOKEN_TTL_MS = env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;

// Lifetimes for the two single-use email links. Defined here rather than in each caller so
// the invite path and the access-request approval path cannot drift apart — both mint the
// same kind of credential and must expire on the same terms.
export const INVITE_TTL_MS = 7 * 86_400_000; // 7 days
export const RESET_TTL_MS = 60 * 60 * 1000; //  1 hour

// --- Refresh sessions -----------------------------------------------------------

/**
 * Create a new session (fresh login) or extend an existing lineage (rotation) when a
 * familyId is supplied. Returns the RAW token; only its hash is persisted.
 */
export async function issueRefreshToken(user, { ip = '', userAgent = '', familyId } = {}) {
  const rawToken = generateOpaqueToken(48);
  const session = await Session.create({
    user: user._id ?? user,
    familyId: familyId ?? Session.newFamilyId(),
    tokenHash: hashToken(rawToken),
    ip,
    userAgent,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return { rawToken, session };
}

/**
 * Rotate a refresh token. On success revokes the presented token and returns a fresh one
 * in the same family. For a replayed (already-rotated) token it revokes the ENTIRE family
 * and flags the error with `.reuse = true` so the caller can audit REFRESH_REUSE_DETECTED.
 */
export async function rotateRefreshToken(rawToken, { ip = '', userAgent = '' } = {}) {
  if (!rawToken) throw AppError.unauthorized('Missing refresh token');

  const session = await Session.findOne({ tokenHash: hashToken(rawToken) });
  if (!session) {
    // Forged, or already pruned by the TTL index — either way there is no family to protect.
    throw AppError.unauthorized('Invalid refresh token');
  }

  if (session.revokedAt) {
    // Valid once, already rotated away. Presenting it again means it leaked: burn the
    // whole lineage so the thief and the victim are both signed out.
    await Session.revokeFamily(session.familyId, 'reuse_detected');
    const err = AppError.unauthorized('Refresh token reuse detected');
    err.reuse = true;
    err.userId = session.user;
    throw err;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    throw AppError.unauthorized('Refresh token expired');
  }

  const next = await issueRefreshToken(
    { _id: session.user },
    { ip, userAgent, familyId: session.familyId }
  );

  session.revokedAt = new Date();
  session.revokedReason = 'rotated';
  session.replacedBy = next.session._id;
  await session.save();

  return { userId: session.user, rawToken: next.rawToken, session: next.session };
}

// Revoke the single session behind a token (ordinary logout).
export async function revokeRefreshToken(rawToken, reason = 'logout') {
  if (!rawToken) return;
  await Session.updateOne(
    { tokenHash: hashToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );
}

// Revoke every active session for a user (password reset, forced logout-all).
export async function revokeAllSessions(userId, reason = 'password_reset') {
  await Session.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );
}

// --- MFA (TOTP) -----------------------------------------------------------------
// otplib 13 replaced the class-based `authenticator` singleton with these functional
// exports. Two traps that have already broken code here:
//   - there is NO `authenticator` export;
//   - `epochTolerance` is in SECONDS, and verifySync returns { valid, delta, … }, not a
//     bare boolean — `if (verifySync(...))` is always truthy.

const MFA_ISSUER = 'NWHR';

// ±30s accepts the adjacent time-steps, covering clock skew and a code typed as it rolls
// over. Standard for interactive 2FA.
const EPOCH_TOLERANCE_SECONDS = 30;

// Base32 secret, stored select:false on the user and encoded into the QR.
export function generateMfaSecret() {
  return generateSecret();
}

export function buildOtpAuthUri(user, secret) {
  return generateURI({ issuer: MFA_ISSUER, label: user.email, secret });
}

export function verifyTotp(secret, token) {
  if (!secret || !token) return false;
  const result = verifySync({ secret, token, epochTolerance: EPOCH_TOLERANCE_SECONDS });
  return result.valid === true;
}
