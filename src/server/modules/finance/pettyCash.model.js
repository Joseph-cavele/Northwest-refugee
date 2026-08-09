import mongoose from 'mongoose';
import { reference } from '../../utils/reference.js';

const { Schema } = mongoose;

// A cash float held by one named custodian, the movements against it, and the counts that
// check it.
//
// The control that matters: a custodian may not reconcile their own float. Counting your
// own cash and declaring it correct is the whole of the risk.

export const FLOAT_STATUS = Object.freeze(['ACTIVE', 'SUSPENDED', 'CLOSED']);

export const MOVEMENT_TYPES = Object.freeze([
  'REPLENISHMENT', // money added to the float
  'DISBURSEMENT', // money paid out
  'RETURN', // unspent money handed back
  'ADJUSTMENT', // correction after a reconciliation variance
]);

// Which direction each type moves the balance.
export const MOVEMENT_SIGN = Object.freeze({
  REPLENISHMENT: 1,
  DISBURSEMENT: -1,
  RETURN: 1,
  ADJUSTMENT: 1, // signed by the reconciliation that raises it
});

// --- Float ---------------------------------------------------------------------------

const floatSchema = new Schema(
  {
    reference: { type: String, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },

    // The person answerable for the cash. Changing custodian should follow a count, which
    // is why the service refuses it while the float is unreconciled.
    custodian: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // What the float is topped up to. A reconciliation compares the count against the
    // running balance, not against this.
    imprestCents: { type: Number, required: true, min: 0 },
    balanceCents: { type: Number, required: true, min: 0, default: 0 },

    status: { type: String, enum: FLOAT_STATUS, default: 'ACTIVE', index: true },
    lastReconciledAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

floatSchema.index({ custodian: 1, status: 1 });

floatSchema.virtual('shortfallCents').get(function shortfallCents() {
  return Math.max(0, this.imprestCents - this.balanceCents);
});

// --- Movement ------------------------------------------------------------------------

const movementSchema = new Schema(
  {
    float: { type: Schema.Types.ObjectId, ref: 'PettyCashFloat', required: true, index: true },
    type: { type: String, enum: MOVEMENT_TYPES, required: true, index: true },

    // Positive, like every other amount in this system. MOVEMENT_SIGN carries direction.
    amountCents: { type: Number, required: true, min: 1 },
    description: { type: String, required: true, trim: true, maxlength: 500 },

    // The balance immediately after this movement, so a statement can be read without
    // replaying every prior row.
    balanceAfterCents: { type: Number, required: true, min: 0 },

    budget: { type: Schema.Types.ObjectId, ref: 'Budget', default: null },
    budgetLineCode: { type: String, trim: true, uppercase: true, default: null },

    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recordedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

movementSchema.index({ float: 1, recordedAt: -1 });

// A movement is a ledger row: once written it stands. A mistake is corrected by an
// ADJUSTMENT, not by editing history.
movementSchema.pre('save', function preventEdit() {
  if (!this.isNew) throw new Error('Petty cash movements are immutable — raise an adjustment instead');
});

// --- Reconciliation ------------------------------------------------------------------

const reconciliationSchema = new Schema(
  {
    float: { type: Schema.Types.ObjectId, ref: 'PettyCashFloat', required: true, index: true },

    // What the ledger said, and what was actually in the tin.
    expectedCents: { type: Number, required: true, min: 0 },
    countedCents: { type: Number, required: true, min: 0 },
    // counted − expected. Negative is a shortfall.
    varianceCents: { type: Number, required: true },

    notes: { type: String, trim: true, maxlength: 2000, default: '' },

    // Never the custodian — enforced in the service, which is where the two identities can
    // actually be compared.
    reconciledBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reconciledAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

reconciliationSchema.index({ float: 1, reconciledAt: -1 });

reconciliationSchema.virtual('isBalanced').get(function isBalanced() {
  return this.varianceCents === 0;
});

reconciliationSchema.pre('save', function preventEdit() {
  if (!this.isNew) throw new Error('Reconciliations are immutable');
});

floatSchema.pre('save', function applyRef() {
  if (!this.reference) this.reference = reference('PCF');
});

for (const schema of [floatSchema, movementSchema, reconciliationSchema]) {
  schema.set('toJSON', {
    virtuals: true,
    transform(_doc, ret) {
      delete ret.__v;
      return ret;
    },
  });
}

export const PettyCashFloat =
  mongoose.models.PettyCashFloat || mongoose.model('PettyCashFloat', floatSchema);
export const PettyCashMovement =
  mongoose.models.PettyCashMovement || mongoose.model('PettyCashMovement', movementSchema);
export const PettyCashReconciliation =
  mongoose.models.PettyCashReconciliation ||
  mongoose.model('PettyCashReconciliation', reconciliationSchema);

export default PettyCashFloat;
