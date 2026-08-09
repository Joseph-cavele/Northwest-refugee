import mongoose from 'mongoose';

const { Schema } = mongoose;

// Who is on a cohort, and who turned up to each session.
//
//   Enrollment — one beneficiary on one cohort
//   Attendance — one beneficiary at one session
//
// modules/programmes owns the schedule (Programme → Cohort → Session); this module owns
// the people against it.

export const ENROLLMENT_STATUS = Object.freeze([
  'ENROLLED', // registered, cohort not started
  'ATTENDING', // cohort running
  'COMPLETED', // finished the cohort
  'WITHDRAWN', // left by choice
  'DROPPED_OUT', // stopped attending without notice
]);

// Statuses that still occupy a seat. Withdrawing frees one for someone on the waiting
// list; completing does not, because that seat was used for the whole run.
export const OCCUPIES_SEAT = Object.freeze(['ENROLLED', 'ATTENDING', 'COMPLETED']);
export const ACTIVE_ENROLLMENT = Object.freeze(['ENROLLED', 'ATTENDING']);

export const ATTENDANCE_STATUS = Object.freeze(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);
// What counts as having attended, for the rate a funder is shown.
export const COUNTS_AS_PRESENT = Object.freeze(['PRESENT', 'LATE']);

// --- Enrollment ------------------------------------------------------------------

const enrollmentSchema = new Schema(
  {
    beneficiary: { type: Schema.Types.ObjectId, ref: 'Beneficiary', required: true, index: true },
    cohort: { type: Schema.Types.ObjectId, ref: 'Cohort', required: true, index: true },
    // Copied from the cohort at enrolment. Denormalised so scoping and reporting do not
    // need a join, and so a cohort later moving programme cannot rewrite history.
    programme: { type: Schema.Types.ObjectId, ref: 'Programme', required: true, index: true },

    status: { type: String, enum: ENROLLMENT_STATUS, default: 'ENROLLED', index: true },

    enrolledAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    exitedAt: { type: Date, default: null },
    exitReason: { type: String, trim: true, maxlength: 500, default: null },

    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    capturedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

enrollmentSchema.index({ cohort: 1, status: 1 });
enrollmentSchema.index({ capturedBy: 1, createdAt: -1 });
// One live enrolment per person per cohort. A withdrawn one is exempt, so someone who
// left and came back gets a fresh record rather than a resurrected one.
enrollmentSchema.index(
  { beneficiary: 1, cohort: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['ENROLLED', 'ATTENDING', 'COMPLETED'] } },
    name: 'one_live_enrollment_per_cohort',
  }
);

enrollmentSchema.virtual('isActive').get(function isActive() {
  return ACTIVE_ENROLLMENT.includes(this.status);
});

enrollmentSchema.virtual('occupiesSeat').get(function occupiesSeat() {
  return OCCUPIES_SEAT.includes(this.status) && this.deletedAt === null;
});

// --- Attendance ------------------------------------------------------------------

const attendanceSchema = new Schema(
  {
    session: { type: Schema.Types.ObjectId, ref: 'ProgrammeSession', required: true, index: true },
    enrollment: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true, index: true },
    // Both denormalised from the enrolment: an attendance rate per person and per cohort
    // is the most common query in this module, and neither should need two lookups.
    beneficiary: { type: Schema.Types.ObjectId, ref: 'Beneficiary', required: true, index: true },
    cohort: { type: Schema.Types.ObjectId, ref: 'Cohort', required: true, index: true },

    status: { type: String, enum: ATTENDANCE_STATUS, required: true, index: true },
    notes: { type: String, trim: true, maxlength: 500, default: '' },

    // Who marked the register, and when they actually marked it — not when the session was.
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

// One mark per person per session. Re-marking corrects the existing row rather than
// adding a second — otherwise a register corrected twice would inflate the denominator.
attendanceSchema.index({ session: 1, beneficiary: 1 }, { unique: true, name: 'one_mark_per_person_per_session' });
attendanceSchema.index({ cohort: 1, status: 1 });
attendanceSchema.index({ beneficiary: 1, recordedAt: -1 });

attendanceSchema.virtual('countsAsPresent').get(function countsAsPresent() {
  return COUNTS_AS_PRESENT.includes(this.status);
});

for (const schema of [enrollmentSchema, attendanceSchema]) {
  schema.set('toJSON', {
    virtuals: true,
    transform(_doc, ret) {
      delete ret.__v;
      return ret;
    },
  });
}

export const Enrollment = mongoose.models.Enrollment || mongoose.model('Enrollment', enrollmentSchema);
export const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);

export default Enrollment;
