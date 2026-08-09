import mongoose from 'mongoose';

const { Schema } = mongoose;

// What the organisation has spent on the classification model, so it can be stopped before
// it becomes an invoice nobody budgeted for.
//
// ONE DOCUMENT PER CALENDAR MONTH PER MODEL. The counters are raised with $inc, which is
// atomic in the server — several app instances and several concurrent WhatsApp messages
// all add to the same row without reading it first, so nothing is lost to a race.
//
// TOKENS ARE STORED, NOT RANDS. Two reasons:
//   - a token count is an exact integer, so the running total never drifts, which is the
//     same reason money is held in integer cents everywhere else in this system;
//   - a single classification costs a small fraction of a cent. Rounded to cents at write
//     time every call would store 0 and the total would never move.
// The rand figure is derived at read time from the pricing table in aiUsage.service.js.

const aiUsageSchema = new Schema(
  {
    // 'YYYY-MM' in Africa/Johannesburg. A string, not a Date: this is a bucket label, and
    // comparing labels avoids every timezone question about which month a call fell in.
    period: { type: String, required: true, index: true },

    // Priced per model, so changing OPENAI_MODEL mid-month cannot mis-price either half.
    model: { type: String, required: true },

    inputTokens: { type: Number, default: 0, min: 0 },
    outputTokens: { type: Number, default: 0, min: 0 },
    calls: { type: Number, default: 0, min: 0 },

    // Calls refused because the budget was already spent. Worth counting separately: a
    // large number here means the cap is too low for real traffic, not that nothing happened.
    blockedCalls: { type: Number, default: 0, min: 0 },

    // Stamped the first time the ceiling is crossed in this period, so the staff alert is
    // sent once rather than on every subsequent blocked call.
    budgetExceededNotifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The upsert key. Unique so two instances racing to create the month's row cannot both win.
aiUsageSchema.index({ period: 1, model: 1 }, { unique: true, name: 'unique_period_model' });

aiUsageSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const AiUsage = mongoose.models.AiUsage || mongoose.model('AiUsage', aiUsageSchema);

export default AiUsage;
