import mongoose from 'mongoose';
import {
  GENDER,
  IMMIGRATION_STATUS,
  SUPPORTED_LANGUAGES,
  INTAKE_CHANNELS,
  BENEFICIARY_STATUS,
  VULNERABILITY_FLAGS,
} from '../../config/constants.js';
import { encryptField, decryptField, blindIndex, isEncrypted } from '../../utils/encrypt.js';
import { ageFrom, isMinor, ageBand } from '../../utils/dates.js';
import { beneficiaryReference } from '../../utils/reference.js';

const { Schema } = mongoose;

// The register of people NWHR serves. Beneficiaries are NOT Users — they never
// authenticate. They arrive through the WhatsApp bot or the front desk, and everything
// here is special personal information under POPIA s26.

// --- Consent --------------------------------------------------------------------
// Consent is captured BEFORE any personal data is stored. In the WhatsApp bot, declining
// deletes the session with nothing persisted — a Beneficiary document only ever exists
// for someone who agreed.

const consentSchema = new Schema(
  {
    given: { type: Boolean, required: true },
    givenAt: { type: Date, required: true, default: Date.now },
    // How consent was obtained, so it can be evidenced to the Information Regulator.
    method: {
      type: String,
      enum: ['WHATSAPP', 'SIGNED_FORM', 'VERBAL_WITNESSED'],
      required: true,
    },
    // Version of the consent wording agreed to. Without this, a later change to the text
    // makes every historical consent unprovable.
    policyVersion: { type: String, required: true, default: '1.0' },
    // Consent is withdrawable. Withdrawal does not delete the record — retention may be
    // legally required — but it must stop further processing.
    withdrawnAt: { type: Date, default: null },
    witnessedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

// --- Guardian -------------------------------------------------------------------
// Required for minors. Enforced below in a pre-validate hook, not merely documented.

const guardianSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    relationship: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    // False where a child arrived unaccompanied and the guardian is a placement, not kin.
    isLegalGuardian: { type: Boolean, default: true },
  },
  { _id: false }
);

const beneficiarySchema = new Schema(
  {
    referenceCode: { type: String, unique: true, index: true },

    // --- identity ---
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    otherNames: { type: String, trim: true, maxlength: 120 },
    gender: { type: String, enum: GENDER, required: true, index: true },
    dateOfBirth: { type: Date, required: true },
    nationality: { type: String, required: true, trim: true, maxlength: 60 },
    // First entry is the preferred language — it decides which prompts.js strings the bot
    // uses and whether an interpreter is needed.
    languages: {
      type: [{ type: String, enum: SUPPORTED_LANGUAGES }],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'At least one language is required',
      },
    },

    // --- immigration ---
    immigration: {
      status: { type: String, enum: IMMIGRATION_STATUS, required: true, index: true },
      // AES-256-GCM ciphertext, never plaintext. select:false so it cannot leak through a
      // routine query; loading it requires beneficiary:read_sensitive and an audit entry.
      permitNumber: { type: String, select: false, default: null },
      // Deterministic HMAC of the same value, so the front desk can still find someone by
      // their permit. Also select:false — it is a stable identifier for one person.
      permitNumberIndex: { type: String, select: false, index: true, sparse: true, default: null },
      permitType: { type: String, trim: true, default: null },
      permitIssuedAt: { type: Date, default: null },
      // Drives the permit-expiry job: an expired permit is the single most consequential
      // fact about an asylum seeker's day.
      permitExpiresAt: { type: Date, index: true, default: null },
      documentId: { type: Schema.Types.ObjectId, ref: 'Document', select: false, default: null },
    },

    // --- contact ---
    contact: {
      cellphone: { type: String, required: true, trim: true },
      // Optional: most beneficiaries have WhatsApp, far fewer have email.
      email: { type: String, trim: true, lowercase: true, select: false, default: null },
      address: { type: String, trim: true, default: '' },
      suburb: { type: String, trim: true, default: '' },
      city: { type: String, trim: true, default: 'Rustenburg' },
      province: { type: String, trim: true, default: 'North West' },
    },

    household: {
      size: { type: Number, min: 1, default: 1 },
      headOfHousehold: { type: Boolean, default: false },
      dependants: { type: Number, min: 0, default: 0 },
    },

    // A minor without a recorded guardian is a child-protection failure. Declared as a
    // conditional `required` rather than a pre('validate') hook on purpose: hooks do not
    // run under validateSync(), so a hook-based rule silently passes in exactly the code
    // path that skips them.
    guardian: {
      type: guardianSchema,
      default: null,
      required: [
        function guardianRequiredForMinors() {
          return isMinor(this.dateOfBirth) === true;
        },
        'A beneficiary under 18 requires a recorded guardian',
      ],
    },

    // The most damaging facts in the system. select:false, and reading them is audited.
    vulnerabilityFlags: {
      type: [{ type: String, enum: VULNERABILITY_FLAGS }],
      select: false,
      default: [],
    },

    consent: { type: consentSchema, required: true },

    intakeChannel: { type: String, enum: INTAKE_CHANNELS, default: 'WALK_IN', index: true },

    status: { type: String, enum: BENEFICIARY_STATUS, default: 'DRAFT', index: true },
    exitReason: { type: String, trim: true, default: null },
    exitAt: { type: Date, default: null },

    // Programmes this person is enrolled on. Coordinators are scoped by this field.
    programmes: [{ type: Schema.Types.ObjectId, ref: 'Programme', index: true }],

    assignedOfficer: { type: Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    // Who captured the record. Peer leaders and volunteers only ever see their own —
    // scopeToProgrammes() filters on exactly this field.
    //
    // Null only for a WhatsApp self-registration, where there genuinely is no staff
    // capturer: the person registered themselves. Every staff-entered record must name
    // one, which is what the conditional keeps.
    capturedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
      required: [
        function staffCaptureNeedsACapturer() {
          return this.intakeChannel !== 'WHATSAPP';
        },
        'capturedBy is required for a staff-captured record',
      ],
    },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    verifiedAt: { type: Date, default: null },

    notes: { type: String, trim: true, default: '' },

    // Soft delete: a purge policy is still owed, and destroying a case history on request
    // would break both continuity of care and the audit trail.
    deletedAt: { type: Date, index: true, default: null },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

// --- indexes --------------------------------------------------------------------
beneficiarySchema.index({ firstName: 'text', lastName: 'text', referenceCode: 'text' });
beneficiarySchema.index({ status: 1, createdAt: -1 });
// The permit-expiry job's query: upcoming expiries for people still on the books.
beneficiarySchema.index({ 'immigration.permitExpiresAt': 1, status: 1 });
beneficiarySchema.index({ capturedBy: 1, createdAt: -1 });

// --- virtuals -------------------------------------------------------------------
beneficiarySchema.virtual('fullName').get(function fullName() {
  return [this.firstName, this.otherNames, this.lastName].filter(Boolean).join(' ');
});

beneficiarySchema.virtual('age').get(function age() {
  return ageFrom(this.dateOfBirth);
});

beneficiarySchema.virtual('isMinor').get(function minor() {
  return isMinor(this.dateOfBirth);
});

beneficiarySchema.virtual('ageBand').get(function band() {
  return ageBand(this.dateOfBirth);
});

beneficiarySchema.virtual('permitExpired').get(function permitExpired() {
  const expiry = this.immigration?.permitExpiresAt;
  return expiry ? expiry.getTime() < Date.now() : null;
});

// --- hooks ----------------------------------------------------------------------

/**
 * Assign a reference code and encrypt the permit number in place. Exported so it can be
 * exercised directly — reaching into mongoose's hook internals to test a pre-save is
 * brittle, and this rule is too important to leave untested.
 */
export function applyIntakeDefaults(doc) {
  if (!doc.referenceCode) doc.referenceCode = beneficiaryReference();

  const raw = doc.immigration?.permitNumber;
  if (raw && !isEncrypted(raw)) {
    // Derive the lookup index from the SAME plaintext, before it is replaced.
    doc.immigration.permitNumberIndex = blindIndex(raw);
    doc.immigration.permitNumber = encryptField(raw);
  } else if (!raw) {
    if (doc.immigration) doc.immigration.permitNumberIndex = null;
  }
  return doc;
}

// Mongoose 9 removed callback-style middleware: a hook receives the wrapped function's
// arguments only, never a `next`. Throwing is how a hook rejects the operation — and a
// thrown error here correctly aborts the save, so a missing ENCRYPTION_KEY can never
// result in a permit number being written in the clear.
beneficiarySchema.pre('save', function encryptSensitiveFields() {
  applyIntakeDefaults(this);
});

// --- methods --------------------------------------------------------------------

/**
 * Decrypt the permit number. The caller must already hold beneficiary:read_sensitive and
 * must write a SENSITIVE_READ audit entry — this method does not check, because the model
 * layer has no request context to audit against.
 */
beneficiarySchema.methods.decryptPermitNumber = function decryptPermitNumber() {
  const stored = this.immigration?.permitNumber;
  return stored ? decryptField(stored) : null;
};

/** Find by permit number without ever putting the plaintext into a query. */
beneficiarySchema.statics.findByPermitNumber = function findByPermitNumber(permitNumber) {
  return this.findOne({
    'immigration.permitNumberIndex': blindIndex(permitNumber),
    deletedAt: null,
  });
};

// Last line of defence: even if a caller explicitly selected the sensitive fields, they
// never reach a JSON response body by accident.
beneficiarySchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    if (ret.immigration) {
      delete ret.immigration.permitNumber;
      delete ret.immigration.permitNumberIndex;
      delete ret.immigration.documentId;
    }
    if (ret.contact) delete ret.contact.email;
    delete ret.vulnerabilityFlags;
    delete ret.__v;
    return ret;
  },
});

const Beneficiary =
  mongoose.models.Beneficiary || mongoose.model('Beneficiary', beneficiarySchema);

export default Beneficiary;
