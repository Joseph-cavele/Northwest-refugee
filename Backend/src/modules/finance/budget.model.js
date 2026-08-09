import mongoose from 'mongoose';
import { PROGRAMME_PILLARS } from '../../config/constants.js';
import { reference } from '../../utils/reference.js';

const { Schema } = mongoose;

// A budget is a set of lines, each with an allocation and two running figures:
//
//   committedCents — approved-in-principle spend that has not yet been paid
//   spentCents     — spend that has been approved and posted
//
// An expense commits against its line the moment it is raised, and moves committed → spent
// when it is approved. Without the commitment step two officers can each raise a R40 000
// expense against a R50 000 line and both look affordable until the second one posts.

export const BUDGET_STATUS = Object.freeze([
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CLOSED',
]);

// Statuses in which a budget can carry commitments and spend.
export const BUDGET_LIVE = Object.freeze(['APPROVED']);

const budgetLineSchema = new Schema(
  {
    // Stable within the budget — transactions reference the line by code, so renaming a
    // description must not orphan them.
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    description: { type: String, required: true, trim: true, maxlength: 200 },

    allocatedCents: { type: Number, required: true, min: 0 },
    committedCents: { type: Number, min: 0, default: 0 },
    spentCents: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

budgetLineSchema.virtual('availableCents').get(function availableCents() {
  return this.allocatedCents - this.committedCents - this.spentCents;
});

const budgetSchema = new Schema(
  {
    reference: { type: String, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    // The SA public-benefit financial year runs March–February; stored as the calendar
    // year in which it ends, so 2026 means March 2025 – February 2026.
    financialYear: { type: Number, required: true, min: 2000, max: 2100, index: true },

    programme: { type: Schema.Types.ObjectId, ref: 'Programme', default: null, index: true },
    pillar: { type: String, enum: Object.values(PROGRAMME_PILLARS), default: null, index: true },

    lines: { type: [budgetLineSchema], default: [] },

    status: { type: String, enum: BUDGET_STATUS, default: 'DRAFT', index: true },

    // Maker-checker. The creator is recorded so the service can refuse to let them
    // approve their own budget — the role table alone is not the control.
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    submittedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, maxlength: 500, default: null },

    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

// One budget per name per financial year.
budgetSchema.index(
  { financialYear: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null }, name: 'unique_budget_per_year' }
);
budgetSchema.index({ status: 1, financialYear: -1 });

budgetSchema.virtual('totalAllocatedCents').get(function total() {
  return (this.lines ?? []).reduce((sum, l) => sum + l.allocatedCents, 0);
});
budgetSchema.virtual('totalCommittedCents').get(function total() {
  return (this.lines ?? []).reduce((sum, l) => sum + l.committedCents, 0);
});
budgetSchema.virtual('totalSpentCents').get(function total() {
  return (this.lines ?? []).reduce((sum, l) => sum + l.spentCents, 0);
});
budgetSchema.virtual('totalAvailableCents').get(function total() {
  return this.totalAllocatedCents - this.totalCommittedCents - this.totalSpentCents;
});

budgetSchema.virtual('isLive').get(function isLive() {
  return BUDGET_LIVE.includes(this.status) && this.deletedAt === null;
});

/** The line a transaction names, or undefined. */
budgetSchema.methods.line = function line(code) {
  return (this.lines ?? []).find((l) => l.code === String(code).toUpperCase());
};

// Mongoose 9 removed callback-style middleware: hooks take the wrapped function's
// arguments only, never a `next`. Throwing is how a hook rejects the operation.
budgetSchema.pre('save', function applyDefaults() {
  if (!this.reference) this.reference = reference('BUD');

  const codes = (this.lines ?? []).map((l) => l.code);
  if (new Set(codes).size !== codes.length) {
    // Two lines with one code makes every commitment ambiguous.
    throw new Error('Budget line codes must be unique within a budget');
  }
});

budgetSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});
budgetLineSchema.set('toJSON', { virtuals: true });

const Budget = mongoose.models.Budget || mongoose.model('Budget', budgetSchema);

export default Budget;
