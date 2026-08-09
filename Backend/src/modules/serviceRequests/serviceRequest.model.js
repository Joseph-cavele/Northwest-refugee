import mongoose from 'mongoose';
import {
  SERVICE_CATEGORIES,
  CATEGORY_PILLAR,
  URGENCY_LEVELS,
  SERVICE_REQUEST_STATUS,
  SLA_DAYS_BY_URGENCY,
  INTAKE_CHANNELS,
  PROGRAMME_PILLARS,
} from '../../config/constants.js';
import { reference } from '../../utils/reference.js';

const { Schema } = mongoose;

// One thing a beneficiary asked for: food, a permit renewal, a school place. Created at
// the front desk or by the WhatsApp bot at the ASK_SERVICE step, then worked to a
// terminal state.

// RESOLVED, REFERRED and CANCELLED are terminal. Reopening is deliberately not allowed —
// a request that can be resolved twice inflates every throughput figure reported to a
// funder, and the honest record of a recurring need is a second request.
const TRANSITIONS = Object.freeze({
  OPEN: ['IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'REFERRED', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'RESOLVED', 'REFERRED', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'RESOLVED', 'REFERRED', 'CANCELLED'],
  RESOLVED: [],
  REFERRED: [],
  CANCELLED: [],
});

export const TERMINAL_STATUSES = Object.freeze(['RESOLVED', 'REFERRED', 'CANCELLED']);

const serviceRequestSchema = new Schema(
  {
    reference: { type: String, unique: true, index: true },
    beneficiary: { type: Schema.Types.ObjectId, ref: 'Beneficiary', required: true, index: true },

    category: { type: String, enum: SERVICE_CATEGORIES, required: true, index: true },
    // Snapshotted from the category at creation. Stored, not derived: re-mapping a
    // category later must not silently rewrite historical reporting.
    pillar: { type: String, enum: Object.values(PROGRAMME_PILLARS), required: true, index: true },
    description: { type: String, trim: true, maxlength: 2000, default: '' },

    urgency: { type: String, enum: URGENCY_LEVELS, default: 'NORMAL', index: true },
    status: { type: String, enum: SERVICE_REQUEST_STATUS, default: 'OPEN', index: true },

    // Derived from urgency at creation. Held as a real date so the overdue queue is an
    // index lookup rather than a computation over every open row.
    dueAt: { type: Date, index: true },

    channel: { type: String, enum: INTAKE_CHANNELS, default: 'WALK_IN' },

    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    // Which programme this falls under, if any — coordinators are scoped by it.
    programme: { type: Schema.Types.ObjectId, ref: 'Programme', default: null, index: true },
    // Who raised it. Peer leaders and volunteers see only their own, same rule as the
    // beneficiary register.
    capturedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    resolution: {
      notes: { type: String, trim: true, maxlength: 2000, default: null },
      resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      resolvedAt: { type: Date, default: null },
    },
    // Set when the outcome was REFERRED — the onward organisation lives on the referral.
    referral: { type: Schema.Types.ObjectId, ref: 'Referral', default: null },

    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

// The caseworker queue: open work, most urgent and most overdue first.
serviceRequestSchema.index({ status: 1, dueAt: 1 });
serviceRequestSchema.index({ assignedTo: 1, status: 1, dueAt: 1 });
serviceRequestSchema.index({ beneficiary: 1, createdAt: -1 });
serviceRequestSchema.index({ capturedBy: 1, createdAt: -1 });

serviceRequestSchema.virtual('isOverdue').get(function isOverdue() {
  if (!this.dueAt || TERMINAL_STATUSES.includes(this.status)) return false;
  return this.dueAt.getTime() < Date.now();
});

serviceRequestSchema.virtual('isTerminal').get(function isTerminal() {
  return TERMINAL_STATUSES.includes(this.status);
});

/** Whether `next` is reachable from `current`. Exposed so the service can 409 with a reason. */
serviceRequestSchema.statics.canTransition = function canTransition(current, next) {
  return (TRANSITIONS[current] ?? []).includes(next);
};

serviceRequestSchema.statics.allowedTransitions = function allowedTransitions(current) {
  return TRANSITIONS[current] ?? [];
};

/** Due date for an urgency. Calendar days, not working days — see the SLA placeholder note. */
serviceRequestSchema.statics.dueDateFor = function dueDateFor(urgency, from = new Date()) {
  const days = SLA_DAYS_BY_URGENCY[urgency] ?? SLA_DAYS_BY_URGENCY.NORMAL;
  return new Date(from.getTime() + days * 86_400_000);
};

// Mongoose 9 removed callback-style middleware: a hook receives the wrapped function's
// arguments only, never a `next`. Throwing is how a hook rejects the operation.
serviceRequestSchema.pre('save', function applyDefaults() {
  if (!this.reference) this.reference = reference('SR');
  if (!this.pillar && this.category) this.pillar = CATEGORY_PILLAR[this.category];
  if (!this.dueAt) this.dueAt = this.constructor.dueDateFor(this.urgency, this.createdAt ?? new Date());
});

serviceRequestSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const ServiceRequest =
  mongoose.models.ServiceRequest || mongoose.model('ServiceRequest', serviceRequestSchema);

export { TRANSITIONS };
export default ServiceRequest;
