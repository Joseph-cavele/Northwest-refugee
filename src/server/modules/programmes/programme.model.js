import mongoose from 'mongoose';
import { PROGRAMME_PILLARS } from '../../config/constants.js';

const { Schema } = mongoose;

// Three models, one hierarchy:
//
//   Programme — an ongoing offering, permanently attached to one of the five pillars
//   Cohort    — one run of it, with its own dates, venue and capacity
//   Session   — one scheduled meeting inside a cohort
//
// Enrolment and attendance live in modules/enrollments and point at a cohort and a
// session respectively; this module owns the schedule, not who turned up.

export const PROGRAMME_STATUS = Object.freeze(['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']);
export const COHORT_STATUS = Object.freeze(['PLANNED', 'OPEN', 'RUNNING', 'COMPLETED', 'CANCELLED']);
export const SESSION_STATUS = Object.freeze(['SCHEDULED', 'HELD', 'CANCELLED']);

// A cohort in one of these can still take enrolments; the rest are closed to them.
export const COHORT_ENROLLABLE = Object.freeze(['PLANNED', 'OPEN']);

// --- Programme -------------------------------------------------------------------

const programmeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // The pillar every report groups by. Changeable only while PLANNED — see the service.
    pillar: { type: String, enum: Object.values(PROGRAMME_PILLARS), required: true, index: true },
    description: { type: String, trim: true, maxlength: 2000, default: '' },

    status: { type: String, enum: PROGRAMME_STATUS, default: 'PLANNED', index: true },

    // The other side of User.programmes — a coordinator is scoped to the programmes named
    // here, so adding someone grants them the whole programme's caseload.
    coordinators: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],

    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    /*
     * THE FORM AN APPLICANT IS SCREENED WITH, chosen by whoever set the programme up.
     *
     * This one reference is what stops programme-specific screening forms being hard-coded
     * into pages. `startScreening` reads it and freezes a copy onto the screening, so adding
     * a new skills programme is an administrator's afternoon rather than a developer's.
     *
     * Null is a legitimate state: a programme that has not decided on its questions yet can
     * still be screened for, with notes and a decision and no form.
     */
    screeningTemplate: {
      type: Schema.Types.ObjectId,
      ref: 'ScreeningTemplate',
      default: null,
      index: true,
    },

    /* What kind of programme this is, in the office's own words — "Computer skills",
       "Sewing". Distinct from `pillar`, which is the reporting axis a funder sees. */
    category: { type: String, trim: true, maxlength: 80, default: '' },
    /* Free text, because "must be able to read and write" and "own sewing machine helpful"
       are both real requirements and neither is a field. */
    requirements: { type: String, trim: true, maxlength: 1000, default: '' },
    location: { type: String, trim: true, maxlength: 200, default: '' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    archivedAt: { type: Date, default: null, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

// One programme per name within a pillar: two "Adult Literacy" programmes under EDUCATION
// split their own reporting in half. The partial filter lets an archived one be replaced.
programmeSchema.index(
  { pillar: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null }, name: 'unique_live_programme_name_per_pillar' }
);

programmeSchema.virtual('isArchived').get(function isArchived() {
  return this.archivedAt !== null;
});

// --- Cohort ----------------------------------------------------------------------

const cohortSchema = new Schema(
  {
    programme: { type: Schema.Types.ObjectId, ref: 'Programme', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },

    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true },

    // Enforced against live enrolments by modules/enrollments — this is the ceiling, not
    // a count.
    capacity: { type: Number, min: 1, max: 1000, default: 30 },
    // Seats taken. Denormalised on purpose: it lets a seat be claimed with one atomic
    // findOneAndUpdate guarded by $expr, so two simultaneous enrolments cannot both pass
    // a read-then-write capacity check. modules/enrollments owns every change to it.
    enrolledCount: { type: Number, min: 0, default: 0 },
    venue: { type: String, trim: true, maxlength: 200, default: '' },
    facilitator: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    status: { type: String, enum: COHORT_STATUS, default: 'PLANNED', index: true },
    cancellationReason: { type: String, trim: true, maxlength: 500, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

cohortSchema.index({ programme: 1, startDate: -1 });
cohortSchema.index({ status: 1, startDate: 1 });

cohortSchema.virtual('isEnrollable').get(function isEnrollable() {
  return COHORT_ENROLLABLE.includes(this.status) && this.deletedAt === null;
});

cohortSchema.virtual('durationDays').get(function durationDays() {
  if (!this.startDate || !this.endDate) return null;
  return Math.round((this.endDate.getTime() - this.startDate.getTime()) / 86_400_000);
});

// --- Session ---------------------------------------------------------------------
// Registered as 'ProgrammeSession'. 'Session' already belongs to modules/auth, where it
// holds refresh-token lineages — registering the name twice throws at import.

const sessionSchema = new Schema(
  {
    cohort: { type: Schema.Types.ObjectId, ref: 'Cohort', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },

    scheduledAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, min: 5, max: 600, default: 60 },

    venue: { type: String, trim: true, maxlength: 200, default: '' },
    facilitator: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    status: { type: String, enum: SESSION_STATUS, default: 'SCHEDULED', index: true },
    cancellationReason: { type: String, trim: true, maxlength: 500, default: null },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

// The register a facilitator opens: this cohort's sessions in order.
sessionSchema.index({ cohort: 1, scheduledAt: 1 });

sessionSchema.virtual('endsAt').get(function endsAt() {
  if (!this.scheduledAt) return null;
  return new Date(this.scheduledAt.getTime() + (this.durationMinutes ?? 0) * 60_000);
});

sessionSchema.virtual('isPast').get(function isPast() {
  return this.scheduledAt ? this.scheduledAt.getTime() < Date.now() : null;
});

for (const schema of [programmeSchema, cohortSchema, sessionSchema]) {
  schema.set('toJSON', {
    virtuals: true,
    transform(_doc, ret) {
      delete ret.__v;
      return ret;
    },
  });
}

export const Programme = mongoose.models.Programme || mongoose.model('Programme', programmeSchema);
export const Cohort = mongoose.models.Cohort || mongoose.model('Cohort', cohortSchema);
export const ProgrammeSession =
  mongoose.models.ProgrammeSession || mongoose.model('ProgrammeSession', sessionSchema);

export default Programme;
