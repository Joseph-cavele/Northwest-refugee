import mongoose from 'mongoose';

const { Schema } = mongoose;

// Two records, both under the EDUCATION and SKILLS_ENTREPRENEURSHIP pillars:
//
//   SchoolPlacement — getting a refugee child into a school seat, and what happened
//   Cooperative     — a group of beneficiaries forming an income-generating co-op

// South African schooling: Grade R (reception) through 12, plus adult basic education.
export const GRADES = Object.freeze([
  'R', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'ABET',
]);

export const PLACEMENT_STATUS = Object.freeze([
  'APPLIED', // application lodged with the school
  'PLACED', // seat offered
  'ATTENDING', // child is in class
  'WITHDRAWN', // left before completing the year
  'COMPLETED', // finished the year
  'REFUSED', // school declined admission
]);

// A primary co-operative under the Co-operatives Act 14 of 2005 requires a minimum of
// five natural persons. Registration is refused below this, so the service enforces it
// rather than letting a co-op be marked REGISTERED when CIPC would not have accepted it.
export const MIN_COOPERATIVE_MEMBERS = 5;

export const COOPERATIVE_SECTORS = Object.freeze([
  'AGRICULTURE', 'CATERING', 'CLEANING', 'CRAFT', 'RETAIL', 'SEWING',
  'CONSTRUCTION', 'TRANSPORT', 'SERVICES', 'OTHER',
]);

export const COOPERATIVE_STATUS = Object.freeze([
  'FORMING', 'REGISTERED', 'TRADING', 'DORMANT', 'DISSOLVED',
]);

export const MEMBER_ROLES = Object.freeze(['CHAIRPERSON', 'SECRETARY', 'TREASURER', 'MEMBER']);

// --- SchoolPlacement -------------------------------------------------------------

const schoolPlacementSchema = new Schema(
  {
    beneficiary: { type: Schema.Types.ObjectId, ref: 'Beneficiary', required: true, index: true },

    school: {
      name: { type: String, required: true, trim: true, maxlength: 200 },
      // The Department of Basic Education's own identifier for a school. Recorded where
      // known so a placement can be matched against DBE data without name-matching.
      emisNumber: { type: String, trim: true, maxlength: 20, default: null },
      phase: { type: String, enum: ['PRIMARY', 'SECONDARY', 'COMBINED', 'ABET'], default: null },
    },

    grade: { type: String, enum: GRADES, required: true, index: true },
    // Calendar year the placement is for. The SA school year is a calendar year, so this
    // is a plain number rather than a span.
    academicYear: { type: Number, required: true, min: 2000, max: 2100, index: true },

    status: { type: String, enum: PLACEMENT_STATUS, default: 'APPLIED', index: true },

    appliedAt: { type: Date, default: Date.now },
    placedAt: { type: Date, default: null },
    exitedAt: { type: Date, default: null },

    refusal: {
      reason: { type: String, trim: true, maxlength: 500, default: null },
      // The advocacy field. A school may NOT refuse admission because a child lacks
      // documentation — Centre for Child Law v Minister of Basic Education (2019) — so a
      // refusal on those grounds is unlawful and is the evidence NWHR acts on. Counting
      // them is the whole point of recording refusals separately from withdrawals.
      dueToLackOfDocuments: { type: Boolean, default: false, index: true },
      escalatedAt: { type: Date, default: null },
    },

    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    programme: { type: Schema.Types.ObjectId, ref: 'Programme', default: null, index: true },
    capturedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

schoolPlacementSchema.index({ academicYear: -1, status: 1 });
schoolPlacementSchema.index({ capturedBy: 1, createdAt: -1 });
// One live placement per child per year: a second would mean two schools at once, and
// would count the child twice in every enrolment figure. A refused or withdrawn
// placement is exempt, so a child turned away by one school can be placed at another.
schoolPlacementSchema.index(
  { beneficiary: 1, academicYear: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['APPLIED', 'PLACED', 'ATTENDING'] } },
    name: 'one_live_placement_per_year',
  }
);

schoolPlacementSchema.virtual('isActive').get(function isActive() {
  return ['APPLIED', 'PLACED', 'ATTENDING'].includes(this.status);
});

schoolPlacementSchema.virtual('isUnlawfulRefusal').get(function isUnlawfulRefusal() {
  return this.status === 'REFUSED' && this.refusal?.dueToLackOfDocuments === true;
});

// --- Cooperative -----------------------------------------------------------------

const memberSchema = new Schema(
  {
    beneficiary: { type: Schema.Types.ObjectId, ref: 'Beneficiary', required: true },
    role: { type: String, enum: MEMBER_ROLES, default: 'MEMBER' },
    joinedAt: { type: Date, default: Date.now },
    exitedAt: { type: Date, default: null },
  },
  { _id: false }
);

const cooperativeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200, unique: true },
    sector: { type: String, enum: COOPERATIVE_SECTORS, required: true, index: true },
    description: { type: String, trim: true, maxlength: 2000, default: '' },

    // CIPC registration number, once the co-op is actually registered.
    registrationNumber: { type: String, trim: true, maxlength: 40, default: null },
    status: { type: String, enum: COOPERATIVE_STATUS, default: 'FORMING', index: true },

    members: { type: [memberSchema], default: [] },

    formedAt: { type: Date, default: Date.now },
    registeredAt: { type: Date, default: null },
    dissolvedAt: { type: Date, default: null },

    programme: { type: Schema.Types.ObjectId, ref: 'Programme', default: null, index: true },
    capturedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

cooperativeSchema.index({ status: 1, sector: 1 });
cooperativeSchema.index({ 'members.beneficiary': 1 });

cooperativeSchema.virtual('activeMemberCount').get(function activeMemberCount() {
  return (this.members ?? []).filter((m) => m.exitedAt === null).length;
});

/** Whether the co-op has the five members the Act requires to register. */
cooperativeSchema.virtual('meetsRegistrationMinimum').get(function meets() {
  return this.activeMemberCount >= MIN_COOPERATIVE_MEMBERS;
});

for (const schema of [schoolPlacementSchema, cooperativeSchema]) {
  schema.set('toJSON', {
    virtuals: true,
    transform(_doc, ret) {
      delete ret.__v;
      return ret;
    },
  });
}

export const SchoolPlacement =
  mongoose.models.SchoolPlacement || mongoose.model('SchoolPlacement', schoolPlacementSchema);
export const Cooperative =
  mongoose.models.Cooperative || mongoose.model('Cooperative', cooperativeSchema);

export default SchoolPlacement;
