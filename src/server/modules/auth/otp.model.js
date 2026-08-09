import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { hashToken, generateOpaqueToken } from '../../utils/tokens.js';

const { Schema } = mongoose;

// Two short-lived credential stores, both keyed by a SHA-256 hash of a high-entropy
// value that is never persisted in the clear:
//
//   Token   — single-use invite / verify / reset links sent by email.
//   Session — one row per issued refresh token, with rotation and reuse detection.

// --- Token ----------------------------------------------------------------------

const TOKEN_TYPES = ['invite', 'verify', 'reset'];

const tokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    type: { type: String, enum: TOKEN_TYPES, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// TTL index — Mongo purges spent and expired tokens without a cron job.
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Mint a token: returns the RAW value to email, persists only its hash. The raw value
 * cannot be recovered afterwards — a lost invite link must be reissued, not looked up.
 *
 * `session` joins an open transaction, so approving an access request commits the account
 * and its activation token together or not at all — an account with no way to claim it is
 * an invisible failure nobody notices until the applicant says the link never arrived.
 */
tokenSchema.statics.issue = async function issue({ user, type, ttlMs, session = null }) {
  const raw = generateOpaqueToken(32);
  const doc = {
    user,
    type,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttlMs),
  };
  // create() reads its second argument as options only when the first is an array.
  if (session) await this.create([doc], { session });
  else await this.create(doc);
  return raw;
};

/**
 * Burn every outstanding token of a type for one user, so a freshly issued link is the
 * only one that works.
 *
 * Used when a link is reissued. The previous email is still sitting in an inbox — one
 * that may have been forwarded, shared, or lost with the device — and leaving that link
 * live means a reissue widens access instead of restoring it. Marking the old ones spent
 * rather than deleting them keeps the TTL index in charge of cleanup.
 *
 * Returns the number superseded, which the caller can record in the audit trail.
 */
tokenSchema.statics.supersede = async function supersede({ user, type }) {
  const result = await this.updateMany(
    { user, type, usedAt: null },
    { $set: { usedAt: new Date() } }
  );
  return result.modifiedCount ?? 0;
};

/**
 * Redeem a token atomically. Stamping usedAt in the same operation that matches
 * `usedAt: null` is what guarantees single use under concurrent requests — a read-then-
 * write would let two simultaneous clicks both succeed.
 */
tokenSchema.statics.redeem = async function redeem({ token, type }) {
  return this.findOneAndUpdate(
    { tokenHash: hashToken(token), type, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
};

tokenSchema.statics.TYPES = TOKEN_TYPES;

// --- Session --------------------------------------------------------------------

const REVOKE_REASONS = ['logout', 'rotated', 'reuse_detected', 'password_reset', 'admin'];

const sessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // A login lineage. Rotation revokes the old row and issues a new one in the same
    // family; replaying a rotated token burns the whole family.
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, enum: REVOKE_REASONS, default: null },
    replacedBy: { type: Schema.Types.ObjectId, ref: 'Session', default: null },
  },
  { timestamps: true }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

sessionSchema.statics.hashToken = function hashTokenStatic(raw) {
  return hashToken(raw);
};

sessionSchema.statics.newFamilyId = function newFamilyId() {
  return crypto.randomUUID();
};

// Revoke every still-active session in a lineage — logout-all, password reset, and
// (critically) refresh-token reuse detection.
sessionSchema.statics.revokeFamily = function revokeFamily(familyId, reason) {
  return this.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );
};

sessionSchema.methods.isActive = function isActive() {
  return !this.revokedAt && this.expiresAt.getTime() > Date.now();
};

sessionSchema.statics.REVOKE_REASONS = REVOKE_REASONS;

// Guard against OverwriteModelError when a module is imported more than once (tests).
// NOTE: modules/programmes will introduce a *programme* session — register that one as
// 'ProgrammeSession'. Two mongoose.model('Session') calls throw at import time.
export const Token = mongoose.models.Token || mongoose.model('Token', tokenSchema);
export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);

export { TOKEN_TYPES, REVOKE_REASONS };
