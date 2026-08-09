import mongoose from 'mongoose';
import { SERVICE_CATEGORIES, URGENCY_LEVELS } from '../../config/constants.js';
import { reference } from '../../utils/reference.js';

const { Schema } = mongoose;

// The ongoing file a staff member owns for one beneficiary. A ServiceRequest is a single
// ask ("food parcel", "permit renewal"); a Case is the relationship those asks sit inside,
// with one caseworker answerable for it.

export const CASE_STATUS = Object.freeze(['OPEN', 'ON_HOLD', 'CLOSED']);

export const CLOSURE_OUTCOMES = Object.freeze([
  'RESOLVED', // needs met
  'REFERRED_OUT', // handed to another organisation
  'BENEFICIARY_EXITED', // relocated, returned home, or left the programme
  'UNREACHABLE', // no contact after repeated attempts
  'DUPLICATE', // opened twice for the same person
  'OTHER',
]);

// A case flagged HIGH or URGENT is what the urgent queue shows. Named export so the
// service and the queue cannot drift apart.
export const ESCALATED_PRIORITIES = Object.freeze(['HIGH', 'URGENT']);
export const ACTIVE_STATUSES = Object.freeze(['OPEN', 'ON_HOLD']);

const caseSchema = new Schema(
  {
    caseNumber: { type: String, unique: true, index: true },
    beneficiary: { type: Schema.Types.ObjectId, ref: 'Beneficiary', required: true, index: true },

    // The staff member answerable for this file. Required: an unowned case is one nobody
    // is accountable for, which is how people fall through.
    caseworker: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Primary need. Shares the service-request vocabulary so a case and the requests
    // inside it can be counted together.
    category: { type: String, enum: SERVICE_CATEGORIES, required: true, index: true },
    priority: { type: String, enum: URGENCY_LEVELS, default: 'NORMAL', index: true },
    summary: { type: String, trim: true, maxlength: 2000, default: '' },

    status: { type: String, enum: CASE_STATUS, default: 'OPEN', index: true },

    openedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    openedAt: { type: Date, default: Date.now, index: true },

    closure: {
      outcome: { type: String, enum: CLOSURE_OUTCOMES, default: null },
      notes: { type: String, trim: true, maxlength: 2000, default: null },
      closedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      closedAt: { type: Date, default: null },
    },

    programme: { type: Schema.Types.ObjectId, ref: 'Programme', default: null, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

// The urgent queue, and "my open caseload".
caseSchema.index({ status: 1, priority: 1, openedAt: 1 });
caseSchema.index({ caseworker: 1, status: 1 });
// One active case per person: a second concurrent file splits their history in two and
// double-counts them in every caseload figure. Closed cases are exempt, so someone who
// returns months later gets a fresh file rather than a resurrected one.
//
// The explicit name is required, not cosmetic. `beneficiary` already carries index:true
// for history lookups across all statuses, and Mongo auto-names both of these
// `beneficiary_1` — creating the second then fails with IndexKeySpecsConflict at startup.
caseSchema.index(
  { beneficiary: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['OPEN', 'ON_HOLD'] } },
    name: 'one_active_case_per_beneficiary',
  }
);

caseSchema.virtual('isClosed').get(function isClosed() {
  return this.status === 'CLOSED';
});

caseSchema.virtual('isEscalated').get(function isEscalated() {
  return this.status !== 'CLOSED' && ESCALATED_PRIORITIES.includes(this.priority);
});

/** Whole days the file has been open — the number a supervisor actually asks about. */
caseSchema.virtual('ageDays').get(function ageDays() {
  const end = this.closure?.closedAt ?? new Date();
  return Math.floor((end.getTime() - this.openedAt.getTime()) / 86_400_000);
});

// Mongoose 9 removed callback-style middleware: hooks take the wrapped function's
// arguments only, never a `next`. Throwing is how a hook rejects the operation.
caseSchema.pre('save', function applyDefaults() {
  if (!this.caseNumber) this.caseNumber = reference('CASE');
});

caseSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Case = mongoose.models.Case || mongoose.model('Case', caseSchema);

export default Case;
