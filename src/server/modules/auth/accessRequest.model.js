import mongoose from 'mongoose';
import { ROLES, ACCESS_REQUEST_STATUS } from '../../config/constants.js';

const { Schema } = mongoose;

// Step one of staff onboarding: someone who does not yet have an account asks for one.
//
// This is the only writable collection in the system that an unauthenticated caller can
// reach, so it is shaped defensively. Two things in particular:
//
//   - `requestedRole` is what the applicant ASKED for, and is never granted automatically.
//     An approver names the role they are actually giving, which is stored separately as
//     `grantedRole`. Someone requesting EXECUTIVE_DIRECTOR gets a queue entry, not a title.
//   - a row here is not an account. Nothing can be signed in to until an approver creates
//     the User and the applicant redeems the activation token.

const accessRequestSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true },

    // What the applicant asked for. Advisory input to the approver, never an entitlement.
    requestedRole: { type: String, enum: Object.values(ROLES), required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },

    // Why they want access — the substance of the decision, so it is worth keeping.
    motivation: { type: String, trim: true, maxlength: 1000, default: '' },

    status: { type: String, enum: ACCESS_REQUEST_STATUS, default: 'PENDING', index: true },

    // --- decision ---
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    // The role actually granted, which may differ from requestedRole. Null on a rejection.
    grantedRole: { type: String, enum: Object.values(ROLES), default: null },
    // Shown to the applicant on a rejection, so write it as something a person can read.
    decisionNote: { type: String, trim: true, maxlength: 500, default: '' },
    // The account this became, once approved.
    createdUser: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// At most one open request per email address. Partial, so the same person can reapply
// after a rejection — but cannot flood the queue by submitting the form twice.
accessRequestSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'PENDING' },
    name: 'unique_pending_request_per_email',
  }
);

// The reviewer's queue: oldest pending first, so nobody waits behind a later applicant.
accessRequestSchema.index({ status: 1, createdAt: 1 });

accessRequestSchema.virtual('fullName').get(function fullName() {
  return `${this.firstName} ${this.lastName}`.trim();
});

// virtuals: true so the reviewer's queue can render `fullName` without rejoining the parts.
accessRequestSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

accessRequestSchema.methods.isPending = function isPending() {
  return this.status === 'PENDING';
};

const AccessRequest =
  mongoose.models.AccessRequest || mongoose.model('AccessRequest', accessRequestSchema);

export default AccessRequest;
