import mongoose from 'mongoose';
import { CURRENCY } from '../../config/constants.js';
import { reference } from '../../utils/reference.js';

const { Schema } = mongoose;

// One movement of money.
//
// AMOUNTS ARE ALWAYS POSITIVE. Direction is carried by `type`, never by the sign. A
// negative amount is how a ledger ends up with two ways to express the same thing, and
// then with totals that depend on which one a query happened to use.

export const TRANSACTION_TYPES = Object.freeze(['EXPENSE', 'INCOME', 'TRANSFER', 'REVERSAL']);

export const TRANSACTION_STATUS = Object.freeze([
  'DRAFT', // being prepared
  'PENDING_APPROVAL', // submitted, awaiting a different person
  'APPROVED', // approved and posted to the ledger
  'REJECTED', // refused, any commitment released
  'REVERSED', // corrected by a matching REVERSAL entry
]);

// Approval posts the entry. From here it is part of the record and cannot be edited.
export const POSTED_STATUSES = Object.freeze(['APPROVED', 'REVERSED']);

export const PAYMENT_METHODS = Object.freeze([
  'EFT', 'CASH', 'CARD', 'DEBIT_ORDER', 'PETTY_CASH', 'JOURNAL', 'OTHER',
]);

const transactionSchema = new Schema(
  {
    reference: { type: String, unique: true, index: true },
    type: { type: String, enum: TRANSACTION_TYPES, required: true, index: true },

    // Positive, always. See the note at the top of this file.
    amountCents: { type: Number, required: true, min: 1 },
    currency: { type: String, default: CURRENCY },

    description: { type: String, required: true, trim: true, maxlength: 500 },
    payee: { type: String, trim: true, maxlength: 200, default: '' },
    method: { type: String, enum: PAYMENT_METHODS, default: 'EFT' },

    // An expense must name a budget line; income and transfers need not.
    budget: { type: Schema.Types.ObjectId, ref: 'Budget', default: null, index: true },
    budgetLineCode: { type: String, trim: true, uppercase: true, default: null },

    status: { type: String, enum: TRANSACTION_STATUS, default: 'DRAFT', index: true },

    // Maker-checker. `createdBy` is what the service compares the approver against —
    // holding transaction:approve is necessary but not sufficient.
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    submittedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    approvedAt: { type: Date, default: null },
    postedAt: { type: Date, default: null, index: true },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, maxlength: 500, default: null },

    // A reversal points at what it corrects, and the original points back. Neither row is
    // ever edited or removed — the pair is the correction.
    reversalOf: { type: Schema.Types.ObjectId, ref: 'Transaction', default: null, index: true },
    reversedBy: { type: Schema.Types.ObjectId, ref: 'Transaction', default: null },
    reversalReason: { type: String, trim: true, maxlength: 500, default: null },

    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ budget: 1, budgetLineCode: 1, status: 1 });
transactionSchema.index({ createdBy: 1, createdAt: -1 });

transactionSchema.virtual('isPosted').get(function isPosted() {
  return POSTED_STATUSES.includes(this.status);
});

transactionSchema.virtual('isEditable').get(function isEditable() {
  return this.status === 'DRAFT';
});

/**
 * Posted entries are immutable.
 *
 * Enforced at the model layer so no service, script or console session can quietly amend
 * the ledger. The only fields that may change after posting are the back-references a
 * reversal writes, which is why they are allowlisted rather than the whole document being
 * frozen.
 */
const REVERSAL_LINK_FIELDS = new Set(['status', 'reversedBy', 'updatedAt']);

transactionSchema.pre('save', function guardPostedEntries() {
  if (!this.reference) this.reference = reference('TXN');

  if (this.isNew) return;

  // What the row looked like before this save.
  const wasPosted = POSTED_STATUSES.includes(this.$__.originalStatus ?? this._original?.status);
  if (!wasPosted) return;

  const touched = this.modifiedPaths().filter((p) => !REVERSAL_LINK_FIELDS.has(p));
  if (touched.length > 0) {
    throw new Error(
      `Posted transactions are immutable — use a reversal instead (attempted to change: ${touched.join(', ')})`
    );
  }
});

// Remember the status as loaded, so the hook above can tell "was posted" from
// "is being posted right now".
transactionSchema.post('init', function rememberStatus() {
  this.$__.originalStatus = this.status;
});

transactionSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);

export default Transaction;
