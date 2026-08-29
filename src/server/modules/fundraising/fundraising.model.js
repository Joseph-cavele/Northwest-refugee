import mongoose from 'mongoose';
import { CURRENCY, PROGRAMME_PILLARS } from '../../config/constants.js';
import { reference } from '../../utils/reference.js';

const { Schema } = mongoose;

// Four models, one flow:
//
//   Donor    → who gives
//   Campaign → what they are giving towards
//   Pledge   → a promise to give
//   Donation → money that actually arrived
//
// EVERY AMOUNT IN THIS FILE IS INTEGER CENTS. Field names end in `Cents` so a float can
// never be assigned by accident and mean something a hundred times too small. Rands exist
// only at the API boundary — see utils/money.js.

export const DONOR_TYPES = Object.freeze([
  'INDIVIDUAL', 'CORPORATE', 'TRUST', 'FOUNDATION', 'GOVERNMENT', 'FAITH_BASED', 'OTHER',
]);

export const CAMPAIGN_STATUS = Object.freeze(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']);

export const PLEDGE_STATUS = Object.freeze([
  'PROMISED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'LAPSED', 'CANCELLED',
]);

export const DONATION_METHODS = Object.freeze([
  'CASH', 'EFT', 'DEBIT_ORDER', 'CARD', 'PAYSTACK', 'PAYPAL', 'IN_KIND', 'OTHER',
]);

export const DONATION_STATUS = Object.freeze(['PENDING', 'SETTLED', 'FAILED', 'REFUNDED']);

// Whether this gift stands alone or is one instalment of a standing arrangement. Recorded
// per donation rather than inferred from the method: a debit order is usually recurring but
// a card payment can be either, and reporting on retention needs the donor's actual intent.
export const DONATION_TYPES = Object.freeze(['ONE_TIME', 'RECURRING']);

// Only a settled donation counts towards a campaign total or a donor's giving history.
export const COUNTS_TOWARDS_TOTALS = Object.freeze(['SETTLED']);

// --- Donor ---------------------------------------------------------------------------

const donorSchema = new Schema(
  {
    reference: { type: String, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    type: { type: String, enum: DONOR_TYPES, required: true, index: true },

    email: { type: String, trim: true, lowercase: true, default: null },
    phone: { type: String, trim: true, default: null },

    // Needed on a s18A tax certificate, which is the main reason NWHR holds a donor's
    // details at all. select:false because most screens list donors without needing it.
    taxNumber: { type: String, trim: true, maxlength: 20, select: false, default: null },
    address: { type: String, trim: true, maxlength: 300, default: '' },

    // A donor who asked not to be named publicly. Their record still exists — a receipt
    // and an audit trail are legal obligations — but reporting must not identify them.
    isAnonymous: { type: Boolean, default: false, index: true },

    // Kept in step by the service as donations settle. Denormalised so a donor list does
    // not run an aggregate per row.
    totalGivenCents: { type: Number, min: 0, default: 0 },
    lastGiftAt: { type: Date, default: null, index: true },

    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    /*
     * Null only for a donor who created themselves — somebody giving through the public page
     * at /donate, where there genuinely is no staff capturer. Every donor entered by staff
     * must still name one, which is what the conditional keeps. Mirrors the same rule on
     * Beneficiary.capturedBy, and for the same reason.
     */
    capturedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
      required: [
        function staffCaptureNeedsACapturer() {
          return this.source !== 'ONLINE';
        },
        'capturedBy is required for a staff-captured donor',
      ],
    },
    /** How this donor record came to exist. ONLINE is the public donation page. */
    source: { type: String, enum: ['STAFF', 'ONLINE'], default: 'STAFF', index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

donorSchema.index({ name: 'text' });
donorSchema.index({ type: 1, totalGivenCents: -1 });

// --- Campaign ------------------------------------------------------------------------

const campaignSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200, unique: true },
    description: { type: String, trim: true, maxlength: 2000, default: '' },

    targetCents: { type: Number, min: 0, default: 0 },
    // Settled donations only. Never written directly by a caller.
    raisedCents: { type: Number, min: 0, default: 0 },

    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null, index: true },
    status: { type: String, enum: CAMPAIGN_STATUS, default: 'DRAFT', index: true },

    // Hero image for the public campaign page. A campaign image is promotional material,
    // so unlike a beneficiary document it is delivered from an ordinary public Cloudinary
    // URL rather than a signed, time-limited one.
    featuredImage: { type: String, trim: true, default: null },

    pillar: { type: String, enum: Object.values(PROGRAMME_PILLARS), default: null, index: true },
    programme: { type: Schema.Types.ObjectId, ref: 'Programme', default: null },

    capturedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

campaignSchema.virtual('progressPercent').get(function progressPercent() {
  // Null rather than 0 for an untargeted campaign: "no target" is not "nothing raised".
  if (!this.targetCents) return null;
  return Math.round((this.raisedCents / this.targetCents) * 100);
});

campaignSchema.virtual('isOpen').get(function isOpen() {
  return this.status === 'ACTIVE' && (!this.endsAt || this.endsAt.getTime() >= Date.now());
});

// --- Pledge --------------------------------------------------------------------------

const pledgeSchema = new Schema(
  {
    reference: { type: String, unique: true, index: true },
    donor: { type: Schema.Types.ObjectId, ref: 'Donor', required: true, index: true },
    campaign: { type: Schema.Types.ObjectId, ref: 'Campaign', default: null, index: true },

    amountCents: { type: Number, required: true, min: 1 },
    // Raised as matching donations settle against the pledge.
    fulfilledCents: { type: Number, min: 0, default: 0 },

    dueAt: { type: Date, default: null, index: true },
    status: { type: String, enum: PLEDGE_STATUS, default: 'PROMISED', index: true },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },

    capturedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

pledgeSchema.index({ status: 1, dueAt: 1 });

pledgeSchema.virtual('outstandingCents').get(function outstandingCents() {
  return Math.max(0, this.amountCents - this.fulfilledCents);
});

pledgeSchema.virtual('isOverdue').get(function isOverdue() {
  if (!this.dueAt || ['FULFILLED', 'CANCELLED'].includes(this.status)) return false;
  return this.dueAt.getTime() < Date.now();
});

// --- Donation ------------------------------------------------------------------------

const donationSchema = new Schema(
  {
    reference: { type: String, unique: true, index: true },
    // Null for a genuinely anonymous gift — a cash tin at an event has no donor to record.
    donor: { type: Schema.Types.ObjectId, ref: 'Donor', default: null, index: true },
    campaign: { type: Schema.Types.ObjectId, ref: 'Campaign', default: null, index: true },
    pledge: { type: Schema.Types.ObjectId, ref: 'Pledge', default: null, index: true },

    amountCents: { type: Number, required: true, min: 1 },
    currency: { type: String, default: CURRENCY },
    method: { type: String, enum: DONATION_METHODS, required: true, index: true },
    donationType: { type: String, enum: DONATION_TYPES, default: 'ONE_TIME', index: true },

    status: { type: String, enum: DONATION_STATUS, default: 'PENDING', index: true },

    // The donor's own words — "in memory of my mother", a dedication, a restriction they
    // want noted. Distinct from `notes`, which is what STAFF write about the gift: this one
    // belongs to the donor and is quoted back to them on the receipt, so it is never a
    // place to record an internal opinion.
    message: { type: String, trim: true, maxlength: 1000, default: '' },

    // The gateway's own identifier. Unique and sparse: Paystack retries its
    // notifications, and settling the same reference twice would double-count the money.
    // This index is what makes settlement idempotent, not the code that calls it.
    providerReference: { type: String, trim: true, default: null },

    receivedAt: { type: Date, default: Date.now, index: true },
    settledAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    refundReason: { type: String, trim: true, maxlength: 500, default: null },

    // s18A certificate number, issued only once a donation has settled.
    receiptNumber: { type: String, default: null },
    // When the receipt actually reached the donor. Null after settlement means the send
    // failed or there was no address — a donor chasing their tax certificate is answered
    // from this field, not from an assumption that settling implies sending.
    receiptEmailedAt: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },

    capturedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

donationSchema.index(
  { providerReference: 1 },
  { unique: true, partialFilterExpression: { providerReference: { $type: 'string' } }, name: 'unique_provider_reference' }
);
donationSchema.index({ status: 1, receivedAt: -1 });
donationSchema.index({ campaign: 1, status: 1 });

donationSchema.virtual('isSettled').get(function isSettled() {
  return this.status === 'SETTLED';
});

// Mongoose 9 removed callback-style middleware: hooks take the wrapped function's
// arguments only, never a `next`. Throwing is how a hook rejects the operation.
donorSchema.pre('save', function applyRef() {
  if (!this.reference) this.reference = reference('DNR');
});
pledgeSchema.pre('save', function applyRef() {
  if (!this.reference) this.reference = reference('PLG');
});
donationSchema.pre('save', function applyRef() {
  if (!this.reference) this.reference = reference('GFT');
});

for (const schema of [donorSchema, campaignSchema, pledgeSchema, donationSchema]) {
  schema.set('toJSON', {
    virtuals: true,
    transform(_doc, ret) {
      delete ret.taxNumber;
      delete ret.__v;
      return ret;
    },
  });
}

export const Donor = mongoose.models.Donor || mongoose.model('Donor', donorSchema);
export const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
export const Pledge = mongoose.models.Pledge || mongoose.model('Pledge', pledgeSchema);
export const Donation = mongoose.models.Donation || mongoose.model('Donation', donationSchema);

export default Donation;
