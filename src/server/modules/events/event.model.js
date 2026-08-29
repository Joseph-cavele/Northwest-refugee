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

/*
 * PUBLICATION STATE IS NOT EVENT STATUS, AND MERGING THE TWO WOULD BE A BUG WITH A DATE
 * AND A VENUE ON IT.
 *
 * `status` above answers "is this happening?" — planned, confirmed, done, called off. It is
 * the operational lifecycle the attendance register hangs off, and it existed before there
 * was a public website to put anything on.
 *
 * `publication.status` answers a different question: "may the public see it?" The two move
 * independently in both directions. A CONFIRMED event may be deliberately unpublished
 * because it is for an invited group. A PUBLISHED event may later be CANCELLED — and when
 * that happens it must STAY on the public page, marked cancelled, rather than disappear.
 * Somebody read the notice and may be planning to travel across Rustenburg for it; a silent
 * removal sends them to a locked door. That rule is enforced in the public query, which
 * filters on publication.status and never on status.
 */
export const PUBLICATION_STATUS = Object.freeze(['DRAFT', 'PUBLISHED']);

/*
 * How somebody attends. Distinct from `type` above, which is what KIND of event it is
 * (awareness day, dialogue, training) and is an internal reporting dimension.
 */
export const EVENT_MODES = Object.freeze(['IN_PERSON', 'ONLINE', 'HYBRID']);

/*
 * What the public site is allowed to know about an event.
 *
 * A SEPARATE SUBDOCUMENT RATHER THAN LOOSE FIELDS, and that is the whole safety argument of
 * this feature. The Event document also carries expected and recorded attendance, the
 * capturing officer, the programme and pillar it reports against, and it is the parent of an
 * attendance register holding gender and age bands. None of that may ever reach a public
 * page. Keeping everything publishable inside one named block means the public serialiser
 * is a whitelist of one object — `toPublicEvent` in the service — rather than a blacklist
 * that has to be updated every time somebody adds a field up here and forgets.
 */
const publicationSchema = new Schema(
  {
    status: { type: String, enum: PUBLICATION_STATUS, default: 'DRAFT', index: true },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    /*
     * The card image. A URL rather than an upload reference, because it may be either: a
     * Cloudinary secure URL from the upload endpoint, or a path under /public for artwork
     * that ships with the site. `imagePublicId` is set only for the former, and is what
     * lets a replacement delete the asset it replaced instead of orphaning it.
     */
    imageUrl: { type: String, trim: true, maxlength: 600, default: '' },
    imagePublicId: { type: String, trim: true, maxlength: 300, default: null },

    /* One or two sentences for the listing card. The full description is on the event. */
    summary: { type: String, trim: true, maxlength: 280, default: '' },

    mode: { type: String, enum: EVENT_MODES, default: 'IN_PERSON' },
    /* Where to join, when it is online. Never shown for an IN_PERSON event. */
    onlineUrl: { type: String, trim: true, maxlength: 600, default: '' },

    /* "Who the event is for" — plain language, and the field most likely to stop somebody
       travelling to something that was never meant for them. */
    audience: { type: String, trim: true, maxlength: 300, default: '' },

    registrationInfo: { type: String, trim: true, maxlength: 1000, default: '' },
    registrationUrl: { type: String, trim: true, maxlength: 600, default: '' },
    /* A person and a way to reach them. Free text, because "ask for Grace at the desk" is
       often the true answer and no structured field expresses it. */
    contact: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: false }
);

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

    publication: { type: publicationSchema, default: () => ({}) },

    organiser: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    capturedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

eventSchema.index({ status: 1, startsAt: -1 });
/*
 * The public listing's only query: published, not deleted, soonest first. Compound and in
 * this order so the index alone answers it — the public page is the one route here that is
 * unauthenticated, so it is the one that can be hit hardest by something that is not a user.
 */
eventSchema.index({ 'publication.status': 1, deletedAt: 1, startsAt: 1 });
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
