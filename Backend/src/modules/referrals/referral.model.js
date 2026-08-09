import mongoose from 'mongoose';
import {
  SERVICE_CATEGORIES,
  CATEGORY_PILLAR,
  PROGRAMME_PILLARS,
  URGENCY_LEVELS,
  SLA_DAYS_BY_URGENCY,
} from '../../config/constants.js';
import { reference } from '../../utils/reference.js';

const { Schema } = mongoose;

// Handing a need to an organisation that can meet it — Home Affairs for a permit, Legal
// Aid for a hearing, a clinic, a shelter — or recording that a partner sent someone to
// NWHR. A ServiceRequest that ends REFERRED points at one of these: the onward
// organisation lives here, never on the request.
//
// POPIA: an outbound referral is a disclosure to a third party, so it carries its own
// recorded consent. Agreeing to be on the register is not agreeing to be discussed with an
// outside organisation, and conflating the two is how a GBV survivor's whereabouts reach
// someone she left. Nothing sensitive is copied onto this record either — it holds a
// reference to the person, not their permit number or vulnerability flags — so a screen
// built for partner reporting cannot leak what the register protects.

export const REFERRAL_DIRECTION = Object.freeze(['OUTBOUND', 'INBOUND']);

// Who NWHR actually refers to and receives from, in this district. Codes rather than free
// text so "how many people did Home Affairs turn away this quarter" is a query, not a
// afternoon spent reading notes.
export const ORGANISATION_TYPES = Object.freeze([
  'HOME_AFFAIRS', // DHA — permits, asylum, birth registration
  'LEGAL_AID', // Legal Aid SA, Lawyers for Human Rights, university law clinics
  'HEALTH_FACILITY', // clinic, district hospital
  'SAPS', // South African Police Service
  'SOCIAL_DEVELOPMENT', // DSD, including child protection
  'SASSA', // social grants
  'UN_AGENCY', // UNHCR, IOM
  'NGO',
  'FAITH_BASED',
  'SHELTER',
  'SCHOOL',
  'EMPLOYER',
  'OTHER',
]);

// Same vocabulary as the beneficiary's own consent, so evidence of either reads the same
// way to the Information Regulator.
export const SHARING_CONSENT_METHODS = Object.freeze([
  'WHATSAPP',
  'SIGNED_FORM',
  'VERBAL_WITNESSED',
]);

export const REFERRAL_STATUS = Object.freeze([
  'PENDING', // sent, no answer yet
  'ACCEPTED', // the organisation took it on
  'DECLINED', // turned away — the outcome the advocacy pillar is built on
  'COMPLETED', // the service was actually delivered
  'CANCELLED', // withdrawn by NWHR or by the beneficiary
  'LOST_TO_FOLLOW_UP', // unreachable after repeated attempts
]);

// Terminal, and final. A referral that can be completed twice counts twice in every
// "onward referrals" figure a funder reads, and a second attempt at the same organisation
// is an honest second record — which is also what keeps a partner's decline rate true.
export const TERMINAL_STATUSES = Object.freeze([
  'DECLINED',
  'COMPLETED',
  'CANCELLED',
  'LOST_TO_FOLLOW_UP',
]);

export const OPEN_STATUSES = Object.freeze(['PENDING', 'ACCEPTED']);

const TRANSITIONS = Object.freeze({
  PENDING: ['ACCEPTED', 'DECLINED', 'CANCELLED', 'LOST_TO_FOLLOW_UP'],
  // DECLINED is reachable from ACCEPTED on purpose: a partner who accepted the paper
  // referral can still turn someone away at the counter, and that is the event worth
  // counting.
  ACCEPTED: ['COMPLETED', 'DECLINED', 'CANCELLED', 'LOST_TO_FOLLOW_UP'],
  DECLINED: [],
  COMPLETED: [],
  CANCELLED: [],
  LOST_TO_FOLLOW_UP: [],
});

const sharingConsentSchema = new Schema(
  {
    given: {
      type: Boolean,
      required: true,
      // A recorded "no" is not consent. Keeping the refusal on file is right; referring
      // anyway is the disclosure this field exists to prevent.
      validate: {
        validator: (value) => value === true,
        message: 'A referral cannot be made without consent to share this information',
      },
    },
    givenAt: { type: Date, required: true, default: Date.now },
    method: { type: String, enum: SHARING_CONSENT_METHODS, required: true },
    // Version of the wording agreed to. Without it a later change to the text makes every
    // historical consent unprovable.
    policyVersion: { type: String, required: true, default: '1.0' },
    witnessedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

const referralSchema = new Schema(
  {
    reference: { type: String, unique: true, index: true },
    beneficiary: { type: Schema.Types.ObjectId, ref: 'Beneficiary', required: true, index: true },

    // Optional context. Both are checked against the beneficiary in the service — a
    // referral filed under someone else's case is a record two people's histories are
    // wrong about.
    case: { type: Schema.Types.ObjectId, ref: 'Case', default: null, index: true },
    serviceRequest: {
      type: Schema.Types.ObjectId,
      ref: 'ServiceRequest',
      default: null,
      index: true,
    },

    // OUTBOUND is NWHR disclosing; INBOUND is a partner sending someone to us, which is
    // where the REFERRAL intake channel comes from.
    direction: { type: String, enum: REFERRAL_DIRECTION, default: 'OUTBOUND', index: true },

    // A plain nested object, not a subdocument: contact people move on and their details
    // are patched field by field. Name and type are not patchable — see the update rules
    // in referral.service.js.
    organisation: {
      name: { type: String, required: true, trim: true, maxlength: 200 },
      type: { type: String, enum: ORGANISATION_TYPES, required: true, index: true },
      contactPerson: { type: String, trim: true, maxlength: 120, default: null },
      phone: { type: String, trim: true, default: null },
      email: { type: String, trim: true, lowercase: true, default: null },
    },

    category: { type: String, enum: SERVICE_CATEGORIES, required: true, index: true },
    // Snapshotted at creation, like a service request's. Re-mapping a category later must
    // not silently rewrite last year's donor figures.
    pillar: { type: String, enum: Object.values(PROGRAMME_PILLARS), required: true, index: true },

    urgency: { type: String, enum: URGENCY_LEVELS, default: 'NORMAL', index: true },
    // Why this person is being referred. Free text, and it can quote a beneficiary
    // directly — which is why it never reaches the audit trail or a notification.
    reason: { type: String, trim: true, maxlength: 2000, default: '' },

    status: { type: String, enum: REFERRAL_STATUS, default: 'PENDING', index: true },

    referredAt: { type: Date, default: Date.now, index: true },
    // When to chase the organisation, derived from urgency at creation. A real date so the
    // follow-up queue is an index lookup rather than a computation over every open row.
    followUpAt: { type: Date, index: true },
    respondedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },

    outcome: {
      notes: { type: String, trim: true, maxlength: 2000, default: null },
      recordedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      recordedAt: { type: Date, default: null },
    },

    // Required for OUTBOUND only: on an inbound referral the disclosure was the partner's
    // to justify, and demanding consent we never collected would mean inventing it.
    informationSharing: {
      type: sharingConsentSchema,
      default: null,
      // A conditional `required` rather than a pre('validate') hook, for the same reason
      // the guardian rule is one: hooks do not run under validateSync(), so a hook-based
      // rule silently passes in exactly the code path that skips them.
      required: [
        function consentRequiredForOutbound() {
          return this.direction === 'OUTBOUND';
        },
        'Recorded consent to share this information is required before referring someone out',
      ],
    },

    programme: { type: Schema.Types.ObjectId, ref: 'Programme', default: null, index: true },
    // Who made it. Scoping reads this, so it is the referral's own capturedBy.
    referredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

// The follow-up queue: still waiting, longest overdue first.
referralSchema.index({ status: 1, followUpAt: 1 });
referralSchema.index({ beneficiary: 1, createdAt: -1 });
referralSchema.index({ referredBy: 1, createdAt: -1 });
// Partner reporting — acceptance and decline rates by organisation type.
referralSchema.index({ 'organisation.type': 1, status: 1 });

referralSchema.virtual('isTerminal').get(function isTerminal() {
  return TERMINAL_STATUSES.includes(this.status);
});

referralSchema.virtual('isOverdue').get(function isOverdue() {
  if (!this.followUpAt || TERMINAL_STATUSES.includes(this.status)) return false;
  return this.followUpAt.getTime() < Date.now();
});

/** Whole days from referral to outcome — the number a partner review actually asks about. */
referralSchema.virtual('ageDays').get(function ageDays() {
  const end = this.closedAt ?? new Date();
  return Math.floor((end.getTime() - this.referredAt.getTime()) / 86_400_000);
});

/** Whether `next` is reachable from `current`. Exposed so the service can 409 with a reason. */
referralSchema.statics.canTransition = function canTransition(current, next) {
  return (TRANSITIONS[current] ?? []).includes(next);
};

referralSchema.statics.allowedTransitions = function allowedTransitions(current) {
  return TRANSITIONS[current] ?? [];
};

/**
 * When to chase. Reuses the service-request standards: a beneficiary does not experience a
 * one-day need differently because the answer has to come from outside.
 */
referralSchema.statics.followUpDateFor = function followUpDateFor(urgency, from = new Date()) {
  const days = SLA_DAYS_BY_URGENCY[urgency] ?? SLA_DAYS_BY_URGENCY.NORMAL;
  return new Date(from.getTime() + days * 86_400_000);
};

// Mongoose 9 removed callback-style middleware: a hook receives the wrapped function's
// arguments only, never a `next`. Throwing is how a hook rejects the operation.
referralSchema.pre('save', function applyDefaults() {
  if (!this.reference) this.reference = reference('REF');
  if (!this.pillar && this.category) this.pillar = CATEGORY_PILLAR[this.category];
  if (!this.followUpAt) {
    this.followUpAt = this.constructor.followUpDateFor(this.urgency, this.referredAt ?? new Date());
  }
});

referralSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Referral = mongoose.models.Referral || mongoose.model('Referral', referralSchema);

export { TRANSITIONS };
export default Referral;
