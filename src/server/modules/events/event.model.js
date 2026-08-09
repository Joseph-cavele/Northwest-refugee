import mongoose from 'mongoose';
import { PROGRAMME_PILLARS, GENDER } from '../../config/constants.js';
import { AGE_BANDS } from '../../utils/dates.js';

const { Schema } = mongoose;

// Community events: awareness days, outreach, dialogues, commemorations.
//
//   Event            — the occasion
//   EventParticipant — one attendance record against it
//
// An event register is NOT a beneficiary intake. Most people at a community event never
// become beneficiaries and have consented to nothing, so the participant schema is built
// so the ordinary case stores no identifying information at all — see the note there.

export const EVENT_TYPES = Object.freeze([
  'AWARENESS', 'OUTREACH', 'COMMUNITY_DIALOGUE', 'TRAINING',
  'COMMEMORATION', 'FUNDRAISER', 'STAKEHOLDER_MEETING', 'OTHER',
]);

export const EVENT_STATUS = Object.freeze(['PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED']);

// --- Event -------------------------------------------------------------------------

const eventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    type: { type: String, enum: EVENT_TYPES, required: true, index: true },

    // Optional: not every event belongs to a programme, but reporting groups by pillar.
    pillar: { type: String, enum: Object.values(PROGRAMME_PILLARS), default: null, index: true },
    programme: { type: Schema.Types.ObjectId, ref: 'Programme', default: null, index: true },

    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, default: null },
    venue: { type: String, trim: true, maxlength: 200, default: '' },
    address: { type: String, trim: true, maxlength: 300, default: '' },

    status: { type: String, enum: EVENT_STATUS, default: 'PLANNED', index: true },
    cancellationReason: { type: String, trim: true, maxlength: 500, default: null },

    // What was planned for, so the gap against the register is visible.
    expectedAttendance: { type: Number, min: 0, max: 100_000, default: 0 },
    // Kept in step by the service as participants are recorded. Denormalised because
    // every listing shows it and a per-row count would be a query each.
    recordedAttendance: { type: Number, min: 0, default: 0 },

    organiser: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    capturedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

eventSchema.index({ status: 1, startsAt: -1 });
eventSchema.index({ capturedBy: 1, startsAt: -1 });

eventSchema.virtual('isPast').get(function isPast() {
  return this.startsAt ? this.startsAt.getTime() < Date.now() : null;
});

eventSchema.virtual('attendanceVariance').get(function attendanceVariance() {
  if (!this.expectedAttendance) return null;
  return this.recordedAttendance - this.expectedAttendance;
});

// --- EventParticipant ---------------------------------------------------------------

const participantSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },

    // Set when the attendee is already on the register — consent is on their record and
    // nothing further needs storing here.
    beneficiary: { type: Schema.Types.ObjectId, ref: 'Beneficiary', default: null, index: true },

    // Everyone else is counted, not identified. A walk-in at a community event has
    // consented to nothing, so the default shape of this record carries no name, no
    // number and nothing that could single a person out — only what reporting needs.
    gender: { type: String, enum: GENDER, default: 'UNDISCLOSED' },
    ageBand: { type: String, enum: AGE_BANDS, default: null },
    isFirstTime: { type: Boolean, default: false },

    // Only populated when the attendee explicitly asked to be contacted and that consent
    // was recorded. The service refuses either field without `consentToContact`.
    consentToContact: { type: Boolean, default: false },
    contactName: { type: String, trim: true, maxlength: 120, default: null },
    contactPhone: { type: String, trim: true, maxlength: 20, default: null },

    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

participantSchema.index({ event: 1, gender: 1 });
// A known beneficiary is counted once per event. Anonymous rows have beneficiary: null
// and are exempt — the partial filter is what allows many of them.
participantSchema.index(
  { event: 1, beneficiary: 1 },
  {
    unique: true,
    partialFilterExpression: { beneficiary: { $type: 'objectId' } },
    name: 'one_row_per_known_attendee',
  }
);

participantSchema.virtual('isAnonymous').get(function isAnonymous() {
  return this.beneficiary === null;
});

// Contact details are gathered for follow-up, not for display in a list.
participantSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.contactPhone;
    delete ret.__v;
    return ret;
  },
});

eventSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export const Event = mongoose.models.Event || mongoose.model('Event', eventSchema);
export const EventParticipant =
  mongoose.models.EventParticipant || mongoose.model('EventParticipant', participantSchema);

export default Event;
