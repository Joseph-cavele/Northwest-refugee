import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import env from '../../config/env.js';
import { ROLES } from '../../config/constants.js';

const { Schema } = mongoose;

// One collection holds all eight staff roles — role is a field, not a subclass.
// Beneficiaries and donors are deliberately NOT here: they never authenticate.
// Peer leaders and volunteers ARE here — they are community members who log in, which is
// why they get row-level scoping rather than a separate table.

const BCRYPT_ROUNDS = env.BCRYPT_SALT_ROUNDS;
const MAX_FAILED_ATTEMPTS = env.MAX_LOGIN_ATTEMPTS;
const LOCK_DURATION_MS = env.LOCKOUT_MINUTES * 60 * 1000;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Absent until an invited user sets a password. `select: false` keeps the hash out of
    // every ordinary query — login must opt in with .select('+passwordHash'). Forgetting
    // the '+' makes comparePassword return false, which looks exactly like a wrong password.
    passwordHash: { type: String, select: false },
    // Staff contact number, E.164. Optional: an account is usable without one, and the
    // access-request form is the only place it is currently captured.
    phone: { type: String, trim: true, default: null },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
    },
    // Directory and reporting grouping only — NOT an access boundary. `role` decides what
    // someone may do; nothing in config/permissions.js reads this. Nullable because the
    // seeded ED account exists before any department does.
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    // invited: created, not yet accepted; active: usable; disabled: soft-deactivated.
    status: {
      type: String,
      enum: ['invited', 'active', 'disabled'],
      default: 'invited',
    },
    // Which programmes a PROJECT_COORDINATOR may act on. scopeToProgrammes() reads this;
    // an empty list correctly matches nothing rather than everything.
    programmes: [{ type: Schema.Types.ObjectId, ref: 'Programme' }],
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, select: false },
    // Stamped into every access token and checked on auth, so a password reset
    // invalidates already-issued (stateless) access tokens immediately — not just the
    // refresh tokens.
    tokenVersion: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Never leak secrets to the client, even if a caller loaded them explicitly.
userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.mfaSecret;
    delete ret.__v;
    return ret;
  },
});

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, BCRYPT_ROUNDS);
};

userSchema.methods.comparePassword = async function comparePassword(plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.isLocked = function isLocked() {
  return Boolean(this.lockUntil && this.lockUntil.getTime() > Date.now());
};

// Record a failed attempt; lock once the threshold is reached. Caller saves.
userSchema.methods.registerFailedLogin = function registerFailedLogin() {
  this.failedLoginAttempts += 1;
  if (this.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    this.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
  }
};

// Clear lockout state after a successful login. Caller saves.
userSchema.methods.resetLoginState = function resetLoginState() {
  this.failedLoginAttempts = 0;
  this.lockUntil = null;
  this.lastLoginAt = new Date();
};

userSchema.statics.MAX_FAILED_ATTEMPTS = MAX_FAILED_ATTEMPTS;
userSchema.statics.LOCK_DURATION_MS = LOCK_DURATION_MS;

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
