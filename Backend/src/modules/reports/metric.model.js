import mongoose from 'mongoose';
import { PROGRAMME_PILLARS } from '../../config/constants.js';

const { Schema } = mongoose;

// One number, for one SAST calendar day, that has already been counted.
//
// WHY STORE ANYTHING. The dashboard cards count live rows and are always right about now.
// They cannot answer "what did this look like in March", because the rows they count keep
// moving: a case closed today leaves the open-case count, and every past Tuesday's figure
// changes with it. A funder's report is a claim about a date that has passed, so the only
// honest way to make it is to have written the number down on the day.
//
// DIMENSIONS ARE DELIBERATELY COARSE. Pillar is the only breakdown axis, because it is the
// one NWHR reports against (config/constants.js). Nationality, gender, age band and
// vulnerability are absent by design, not by omission: Rustenburg's refugee community is
// small enough that "1 Somali woman, GBV survivor, October" identifies a person as surely
// as her name would, and a metrics table is read by roles that hold no beneficiary access
// at all. Adding an axis here is a POPIA decision, not a schema tidy-up.

export const METRIC_UNITS = Object.freeze(['COUNT', 'CENTS']);

/**
 * STOCK — a level at a moment ("open cases"). Never sum a stock across days: three days of
 *         "12 open cases" is twelve cases, not thirty-six.
 * FLOW  — an amount over a period ("cases closed"). Sums across days; a month is the sum
 *         of its days.
 *
 * The distinction is stored per row so a chart can refuse to total a series it must not,
 * rather than relying on whoever built the chart having known.
 */
export const METRIC_KINDS = Object.freeze(['STOCK', 'FLOW']);

// Add an axis here only once something actually writes it — an advertised dimension that
// is never populated reads as "no data for that breakdown" rather than "not collected".
export const METRIC_DIMENSIONS = Object.freeze(['pillar']);

export const DIMENSION_VALUES = Object.freeze({
  pillar: Object.values(PROGRAMME_PILLARS),
});

/**
 * The metric vocabulary. Keys are `domain.measure` and are an API contract: renaming one
 * orphans every stored row that still carries the old string, which reads as a series that
 * simply stopped one day.
 *
 * Labels live here rather than in the frontend for the same reason ROLE_LABELS and
 * PILLAR_LABELS do — one edit, and every screen and export agrees.
 */
export const METRICS = Object.freeze({
  'beneficiaries.active': { label: 'Active beneficiaries', unit: 'COUNT', kind: 'STOCK' },
  'beneficiaries.registered': { label: 'New registrations', unit: 'COUNT', kind: 'FLOW' },
  'beneficiaries.pending_verification': {
    label: 'Awaiting verification',
    unit: 'COUNT',
    kind: 'STOCK',
  },
  'permits.expiring_30d': { label: 'Permits expiring within 30 days', unit: 'COUNT', kind: 'STOCK' },

  'cases.open': { label: 'Open cases', unit: 'COUNT', kind: 'STOCK' },
  'cases.escalated': { label: 'Urgent cases', unit: 'COUNT', kind: 'STOCK' },
  'cases.closed': { label: 'Cases closed', unit: 'COUNT', kind: 'FLOW' },

  'service_requests.open': {
    label: 'Open service requests',
    unit: 'COUNT',
    kind: 'STOCK',
    dimensions: ['pillar'],
  },
  'service_requests.overdue': { label: 'Overdue service requests', unit: 'COUNT', kind: 'STOCK' },
  'service_requests.resolved': {
    label: 'Service requests resolved',
    unit: 'COUNT',
    kind: 'FLOW',
    dimensions: ['pillar'],
  },

  'referrals.awaiting_follow_up': { label: 'Referrals to chase', unit: 'COUNT', kind: 'STOCK' },

  'enrollments.active': { label: 'Active enrolments', unit: 'COUNT', kind: 'STOCK' },
  'attendance.marked': { label: 'Register marks recorded', unit: 'COUNT', kind: 'FLOW' },
  'attendance.present': { label: 'Attendances recorded present', unit: 'COUNT', kind: 'FLOW' },

  'events.upcoming': { label: 'Upcoming events', unit: 'COUNT', kind: 'STOCK' },
  'events.attendance': { label: 'Event attendance', unit: 'COUNT', kind: 'FLOW' },

  'transactions.pending_approval': {
    label: 'Transactions awaiting approval',
    unit: 'COUNT',
    kind: 'STOCK',
  },
  'transactions.pending_approval_value': {
    label: 'Value awaiting approval',
    unit: 'CENTS',
    kind: 'STOCK',
  },

  'donations.settled_count': { label: 'Donations settled', unit: 'COUNT', kind: 'FLOW' },
  'donations.settled_value': { label: 'Donation income', unit: 'CENTS', kind: 'FLOW' },
});

export const METRIC_KEYS = Object.freeze(Object.keys(METRICS));

/** Fail fast on a key no writer or reader could ever match — the metric equivalent of
 * assertKnownPermission(). A typo would otherwise store a row nothing ever reads back. */
export function assertKnownMetric(key) {
  if (!(key in METRICS)) {
    throw new Error(`Unknown metric "${key}" — add it to modules/reports/metric.model.js`);
  }
  return key;
}

const metricSchema = new Schema(
  {
    // SAST midnight for the day being described — see utils/dates.js startOfDaySAST.
    date: { type: Date, required: true, index: true },
    key: { type: String, enum: METRIC_KEYS, required: true, index: true },

    // Null for the organisation-wide figure. A dimensioned set does NOT replace it: the
    // total is stored in its own row so a reader never has to know whether the breakdown
    // it happens to hold is complete.
    dimension: { type: String, enum: [...METRIC_DIMENSIONS, null], default: null },
    dimensionValue: { type: String, default: null },

    // Counts, or integer cents — never a float. Money is cents everywhere below
    // utils/money.js, and a count that is not an integer is a bug that has already
    // happened somewhere upstream.
    value: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isSafeInteger,
        message: 'A metric value must be a whole number (counts, or integer cents)',
      },
    },

    // Snapshotted from METRICS at write time rather than looked up at read time, so a row
    // from last year still renders correctly after the vocabulary is re-tuned.
    unit: { type: String, enum: METRIC_UNITS, required: true },
    kind: { type: String, enum: METRIC_KINDS, required: true },

    computedAt: { type: Date, default: Date.now },
  },
  // No updatedAt: computedAt already says when the number was last worked out, and two
  // timestamps meaning almost the same thing is how they end up disagreeing.
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One row per day per key per dimension value. Unique so re-running a snapshot corrects
// the day instead of stacking a second copy behind it — a job that failed halfway and was
// re-run must not double every figure it had already written.
metricSchema.index(
  { date: 1, key: 1, dimension: 1, dimensionValue: 1 },
  { unique: true, name: 'one_value_per_day_per_metric' }
);
// Reading a series: one key, ascending through time.
metricSchema.index({ key: 1, date: 1 });

/**
 * Write a day's figures, idempotently.
 *
 * `entries` are `{ key, value, dimension?, dimensionValue? }`. unit and kind come from the
 * vocabulary rather than the caller, so a writer cannot file cents as a count.
 *
 * Deliberately no update or delete counterpart. A stored metric is corrected by
 * recomputing the day, which is the same code path that wrote it — an endpoint that could
 * set a reported figure by hand is one that could quietly improve last quarter's numbers.
 */
metricSchema.statics.recordDaily = async function recordDaily(date, entries = []) {
  if (entries.length === 0) return 0;

  const operations = entries.map(({ key, value, dimension = null, dimensionValue = null }) => {
    assertKnownMetric(key);
    const { unit, kind } = METRICS[key];

    // Checked here rather than left to the schema validator: bulkWrite's updateOne does not
    // run validators, so this is the only thing standing between a fractional value and a
    // money column that no longer totals.
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`Metric "${key}" must be a whole number, received: ${String(value)}`);
    }

    return {
      updateOne: {
        filter: { date, key, dimension, dimensionValue },
        update: { $set: { value, unit, kind, computedAt: new Date() } },
        upsert: true,
      },
    };
  });

  const result = await this.bulkWrite(operations, { ordered: false });
  return result.upsertedCount + result.modifiedCount;
};

metricSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Metric = mongoose.models.Metric || mongoose.model('Metric', metricSchema);

export default Metric;
