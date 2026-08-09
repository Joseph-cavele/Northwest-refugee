import mongoose from 'mongoose';

const { Schema } = mongoose;

// A conversation in progress. NOT a beneficiary.
//
// Nothing here is a permanent record. The session holds answers as they are given and is
// turned into a Beneficiary only at finalise(), on the CONFIRM step. Until then it can be
// abandoned, restarted or refused, and nothing survives.
//
// Registered as 'WhatsAppSession': 'Session' belongs to auth's refresh-token lineages and
// 'ProgrammeSession' to the programme schedule. Registering a name twice throws at import.

export const STATES = Object.freeze([
  'GREETING',
  'ASK_LANGUAGE',
  'ASK_CONSENT',
  'ASK_NAME',
  'ASK_SURNAME',
  'ASK_GENDER',
  'ASK_DOB',
  'ASK_NATIONALITY',
  'ASK_IMMIGRATION_STATUS',
  'ASK_PERMIT_NUMBER',
  'ASK_PERMIT_UPLOAD',
  'ASK_SERVICE',
  'CONFIRM',
  'DONE',
]);

// How long an abandoned conversation lives. Long enough that someone interrupted at the
// clinic can come back to it the same day; short enough that half-finished answers about
// a person do not sit in the database indefinitely.
export const SESSION_TTL_HOURS = 24;

const sessionSchema = new Schema(
  {
    // The WhatsApp identity, in E.164. This is personal information held before consent —
    // unavoidably, because it is the address we reply to and they initiated the exchange.
    // It is the ONLY thing stored before consent, and declining deletes the row entirely.
    from: { type: String, required: true, unique: true, index: true },

    state: { type: String, enum: STATES, default: 'GREETING', index: true },
    language: { type: String, default: null },

    consent: {
      given: { type: Boolean, default: null },
      askedAt: { type: Date, default: null },
      answeredAt: { type: Date, default: null },
    },

    // Answers so far. Mixed because it is a partial, in-progress shape — validated by the
    // beneficiary schema only at finalise(), never trusted as it stands.
    draft: { type: Schema.Types.Mixed, default: () => ({}) },

    // Set once the session becomes a real record, so a repeat message is answered with
    // "you are already registered" rather than starting again.
    beneficiary: { type: Schema.Types.ObjectId, ref: 'Beneficiary', default: null },

    lastMessageAt: { type: Date, default: Date.now },
    // No `index: true` here — the TTL index below is already an ascending index on this
    // field, and declaring both makes Mongo auto-name two indexes `expiresAt_1` with
    // different options, which fails at startup.
    expiresAt: { type: Date, required: true },

    // Guards against the same inbound message being handled twice when Meta retries.
    lastInboundMessageId: { type: String, default: null },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

// Mongo sweeps abandoned intakes without a cron job. This is the "half-records" guard.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

sessionSchema.virtual('isComplete').get(function isComplete() {
  return this.state === 'DONE';
});

sessionSchema.virtual('hasConsent').get(function hasConsent() {
  return this.consent?.given === true;
});

/** Push the expiry out on every message, so an active conversation is never swept. */
sessionSchema.methods.touch = function touch() {
  this.lastMessageAt = new Date();
  this.expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
  return this;
};

// Mongoose 9 removed callback-style middleware: hooks take the wrapped function's
// arguments only, never a `next`.
sessionSchema.pre('save', function applyExpiry() {
  if (!this.expiresAt) this.touch();
});

sessionSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    // The draft holds a person's name, date of birth and possibly a permit number before
    // any of it is a record. It never leaves the bot.
    delete ret.draft;
    delete ret.__v;
    return ret;
  },
});

export const WhatsAppSession =
  mongoose.models.WhatsAppSession || mongoose.model('WhatsAppSession', sessionSchema);

export default WhatsAppSession;
