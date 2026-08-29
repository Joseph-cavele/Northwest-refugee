import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { startOfDaySAST, startOfMonthSAST, sastDayRange } from '../../utils/dates.js';
import {
  PERMISSIONS,
  hasPermission,
  scopeToProgrammes,
  isProgrammeScoped,
  isOwnRecordsOnly,
} from '../../config/permissions.js';
import { PROGRAMME_PILLARS, PAGINATION } from '../../config/constants.js';

// Cross-module MODEL imports, read-only and counting only.
//
// The architecture rule is service → service, and every other module obeys it. Reporting
// is the documented exception ("the read-only lookups already present"): it has to count
// across nine collections, none of which expose a count function, and adding one to each
// would put a reporting concern inside nine unrelated modules. Nothing below writes, and
// nothing below loads a document — these are countDocuments and $sum, so no select:false
// field is ever read and no toJSON transform is bypassed.
import Beneficiary from '../beneficiaries/beneficiary.model.js';
import Case, { ESCALATED_PRIORITIES, ACTIVE_STATUSES as ACTIVE_CASE_STATUSES } from '../cases/case.model.js';
import ServiceRequest, { TERMINAL_STATUSES as TERMINAL_REQUEST_STATUSES } from '../serviceRequests/serviceRequest.model.js';
import Referral, { OPEN_STATUSES as OPEN_REFERRAL_STATUSES } from '../referrals/referral.model.js';
import { Enrollment, Attendance, ACTIVE_ENROLLMENT, COUNTS_AS_PRESENT } from '../enrollments/enrollment.model.js';
import { Event } from '../events/event.model.js';
import Transaction from '../finance/transaction.model.js';
import { Donation, COUNTS_TOWARDS_TOTALS } from '../fundraising/fundraising.model.js';
import Metric, { METRICS, METRIC_KEYS, assertKnownMetric } from './metric.model.js';

const P = PERMISSIONS;

// Row-level scope fields, mirrored from the service that owns each collection. THESE MUST
// MATCH: a card is the headline number for a list screen, and a coordinator whose card
// says 40 open cases against a list showing 6 has been told about six cases that are not
// theirs. tests/report.routes.test.js asserts the two agree, because a comment cannot.
const BENEFICIARY_SCOPE = { programmeField: 'programmes', capturedByField: 'capturedBy' };
const CASE_SCOPE = { programmeField: 'programme', capturedByField: 'openedBy' };
const REQUEST_SCOPE = { programmeField: 'programme', capturedByField: 'capturedBy' };
const REFERRAL_SCOPE = { programmeField: 'programme', capturedByField: 'referredBy' };
const ENROLLMENT_SCOPE = { programmeField: 'programme', capturedByField: 'capturedBy' };

/** True when the caller's role narrows which rows they see at all. */
function isNarrowed(actor) {
  return isProgrammeScoped(actor.role) || isOwnRecordsOnly(actor.role);
}

function scoped(actor, filter, fields) {
  return { ...scopeToProgrammes(actor, filter, fields), deletedAt: null };
}

/**
 * Cases and enrolments are scoped as programme/own-records OR "it is assigned to you" —
 * the same widened rule their own services apply, so a coordinator does not lose sight of
 * a file they are answerable for that sits outside their programmes.
 */
function scopedWithAssignment(actor, filter, fields, assignmentField) {
  const base = { ...filter, deletedAt: null };
  const scope = scopeToProgrammes(actor, {}, fields);
  if (Object.keys(scope).length === 0) return base;
  return { ...base, $and: [{ $or: [scope, { [assignmentField]: actor._id }] }] };
}

/**
 * Total an integer column across matching rows — cents for money, a headcount for
 * attendance. Returns 0 rather than null on an empty match: a card reading "—" where the
 * honest answer is "nothing yet" invites a support call.
 */
async function sumField(Model, filter, field = 'amountCents') {
  const [row] = await Model.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: `$${field}` } } },
  ]);
  return row?.total ?? 0;
}

// --- dashboard cards ---------------------------------------------------------------

/**
 * CARD_PERIODS
 *   CURRENT        — a level right now (a STOCK metric).
 *   MONTH_TO_DATE  — a total since SAST month start (a FLOW metric).
 *
 * Sent to the client rather than implied by the label, so a card can never be charted or
 * exported as though it covered a different window than it does.
 */
export const CARD_PERIODS = Object.freeze(['CURRENT', 'MONTH_TO_DATE']);

/**
 * Every card the dashboard can show, and the permission that earns it.
 *
 * A card the caller may not see is ABSENT, never zero. "0 open cases" is a statement about
 * the caseload; the truth is "you cannot see the caseload", and the two must not look
 * alike on a screen someone makes a decision from.
 *
 * `key` is a metric key on purpose: the card and the stored series are the same measure,
 * so a card can be expanded into its own history without a second vocabulary to map
 * between. The value differs only in window — the card is now or month-to-date, the series
 * is one row per day.
 */
const CARDS = Object.freeze([
  // --- the register ---
  {
    key: 'beneficiaries.active',
    group: 'register',
    period: 'CURRENT',
    permission: P.BENEFICIARY_READ,
    scoped: true,
    value: (actor) => Beneficiary.countDocuments(scoped(actor, { status: 'ACTIVE' }, BENEFICIARY_SCOPE)),
  },
  {
    key: 'beneficiaries.pending_verification',
    group: 'register',
    period: 'CURRENT',
    permission: P.BENEFICIARY_READ,
    scoped: true,
    value: (actor) =>
      Beneficiary.countDocuments(scoped(actor, { status: 'PENDING_VERIFICATION' }, BENEFICIARY_SCOPE)),
  },
  {
    key: 'beneficiaries.registered',
    group: 'register',
    period: 'MONTH_TO_DATE',
    permission: P.BENEFICIARY_READ,
    scoped: true,
    value: (actor) =>
      Beneficiary.countDocuments(
        scoped(actor, { createdAt: { $gte: startOfMonthSAST() } }, BENEFICIARY_SCOPE)
      ),
  },
  {
    key: 'permits.expiring_30d',
    group: 'register',
    period: 'CURRENT',
    permission: P.BENEFICIARY_READ,
    scoped: true,
    // Counting an expiry date discloses nothing: permitExpiresAt is an ordinary field, and
    // only permitNumber is select:false. Withdrawn consent is excluded to match
    // findExpiringPermits — someone who asked us to stop is not a pending action.
    value: (actor) =>
      Beneficiary.countDocuments(
        scoped(
          actor,
          {
            status: { $in: ['ACTIVE', 'PENDING_VERIFICATION'] },
            'consent.withdrawnAt': null,
            'immigration.permitExpiresAt': { $ne: null, $lte: new Date(Date.now() + 30 * 86_400_000) },
          },
          BENEFICIARY_SCOPE
        )
      ),
  },

  // --- casework ---
  {
    key: 'cases.open',
    group: 'casework',
    period: 'CURRENT',
    permission: P.CASE_READ,
    scoped: true,
    value: (actor) =>
      Case.countDocuments(
        scopedWithAssignment(actor, { status: { $in: ACTIVE_CASE_STATUSES } }, CASE_SCOPE, 'caseworker')
      ),
  },
  {
    key: 'cases.escalated',
    group: 'casework',
    period: 'CURRENT',
    permission: P.CASE_READ,
    scoped: true,
    value: (actor) =>
      Case.countDocuments(
        scopedWithAssignment(
          actor,
          { status: { $in: ACTIVE_CASE_STATUSES }, priority: { $in: ESCALATED_PRIORITIES } },
          CASE_SCOPE,
          'caseworker'
        )
      ),
  },
  {
    key: 'cases.closed',
    group: 'casework',
    period: 'MONTH_TO_DATE',
    permission: P.CASE_READ,
    scoped: true,
    value: (actor) =>
      Case.countDocuments(
        scopedWithAssignment(
          actor,
          { status: 'CLOSED', 'closure.closedAt': { $gte: startOfMonthSAST() } },
          CASE_SCOPE,
          'caseworker'
        )
      ),
  },
  {
    key: 'service_requests.open',
    group: 'casework',
    period: 'CURRENT',
    permission: P.SERVICE_REQUEST_READ,
    scoped: true,
    value: (actor) =>
      ServiceRequest.countDocuments(
        scoped(actor, { status: { $nin: TERMINAL_REQUEST_STATUSES } }, REQUEST_SCOPE)
      ),
  },
  {
    key: 'service_requests.overdue',
    group: 'casework',
    period: 'CURRENT',
    permission: P.SERVICE_REQUEST_READ,
    scoped: true,
    value: (actor) =>
      ServiceRequest.countDocuments(
        scoped(
          actor,
          { status: { $nin: TERMINAL_REQUEST_STATUSES }, dueAt: { $lt: new Date() } },
          REQUEST_SCOPE
        )
      ),
  },
  {
    key: 'referrals.awaiting_follow_up',
    group: 'casework',
    period: 'CURRENT',
    permission: P.REFERRAL_READ,
    scoped: true,
    value: (actor) =>
      Referral.countDocuments(
        scoped(
          actor,
          { status: { $in: OPEN_REFERRAL_STATUSES }, followUpAt: { $lt: new Date() } },
          REFERRAL_SCOPE
        )
      ),
  },

  // --- programmes ---
  {
    key: 'enrollments.active',
    group: 'programmes',
    period: 'CURRENT',
    permission: P.ENROLLMENT_READ,
    scoped: true,
    value: (actor) =>
      Enrollment.countDocuments(
        scopedWithAssignment(
          actor,
          { status: { $in: ACTIVE_ENROLLMENT } },
          ENROLLMENT_SCOPE,
          'capturedBy'
        )
      ),
  },

  // --- events ---
  {
    key: 'events.upcoming',
    group: 'events',
    period: 'CURRENT',
    permission: P.EVENT_READ,
    scoped: false,
    value: () =>
      Event.countDocuments({
        deletedAt: null,
        status: { $in: ['PLANNED', 'CONFIRMED'] },
        startsAt: { $gte: new Date() },
      }),
  },
  {
    key: 'events.attendance',
    group: 'events',
    period: 'MONTH_TO_DATE',
    permission: P.EVENT_READ,
    scoped: false,
    value: () =>
      sumField(
        Event,
        { deletedAt: null, status: 'COMPLETED', startsAt: { $gte: startOfMonthSAST() } },
        'recordedAttendance'
      ),
  },

  // --- finance (never row-scoped: the ledger is organisation-wide) ---
  {
    key: 'transactions.pending_approval',
    group: 'finance',
    period: 'CURRENT',
    permission: P.TRANSACTION_READ,
    scoped: false,
    value: () => Transaction.countDocuments({ deletedAt: null, status: 'PENDING_APPROVAL' }),
  },
  {
    key: 'transactions.pending_approval_value',
    group: 'finance',
    period: 'CURRENT',
    permission: P.TRANSACTION_READ,
    scoped: false,
    value: () => sumField(Transaction, { deletedAt: null, status: 'PENDING_APPROVAL' }),
  },

  // --- fundraising ---
  {
    key: 'donations.settled_count',
    group: 'fundraising',
    period: 'MONTH_TO_DATE',
    permission: P.DONATION_READ,
    scoped: false,
    value: () =>
      Donation.countDocuments({
        deletedAt: null,
        status: { $in: COUNTS_TOWARDS_TOTALS },
        settledAt: { $gte: startOfMonthSAST() },
      }),
  },
  {
    key: 'donations.settled_value',
    group: 'fundraising',
    period: 'MONTH_TO_DATE',
    permission: P.DONATION_READ,
    scoped: false,
    // Settled only. A PENDING gateway donation is money that has been promised by a form
    // submission, and counting it is how a campaign total quietly overstates itself.
    value: () =>
      sumField(Donation, {
        deletedAt: null,
        status: { $in: COUNTS_TOWARDS_TOTALS },
        settledAt: { $gte: startOfMonthSAST() },
      }),
  },
]);

// Wire-up check, same reasoning as assertKnownPermission(): a card naming a metric that
// does not exist would ship a label of `undefined` to every dashboard.
for (const card of CARDS) {
  assertKnownMetric(card.key);
  if (!CARD_PERIODS.includes(card.period)) {
    throw new Error(`Card "${card.key}" has an unknown period "${card.period}"`);
  }
  const expected = card.period === 'CURRENT' ? 'STOCK' : 'FLOW';
  if (METRICS[card.key].kind !== expected) {
    throw new Error(
      `Card "${card.key}" is ${card.period} but the metric is a ${METRICS[card.key].kind} — a stock cannot be a month-to-date total`
    );
  }
}

/**
 * The cards this user may see, counted live.
 *
 * Figures are row-scoped exactly as the matching list screen is, so a card is always the
 * headline for a list the caller can actually open. `scoped: true` on a returned card says
 * the figure covers the caller's own caseload rather than the organisation — the UI needs
 * that to caption it honestly, and it is not derivable from the number.
 */
export async function getDashboardCards(actor) {
  if (!actor) throw AppError.unauthorized();

  const visible = CARDS.filter((card) => hasPermission(actor.role, card.permission));
  const narrowed = isNarrowed(actor);

  // Every count is an indexed countDocuments, so they run together rather than serially.
  const values = await Promise.all(visible.map((card) => card.value(actor)));

  return {
    generatedAt: new Date(),
    cards: visible.map((card, index) => ({
      key: card.key,
      label: METRICS[card.key].label,
      unit: METRICS[card.key].unit,
      group: card.group,
      period: card.period,
      scoped: card.scoped && narrowed,
      value: values[index],
    })),
  };
}

// --- the daily snapshot ------------------------------------------------------------

/**
 * How far back a snapshot may be taken.
 *
 * A FLOW can be recomputed for any past day — it is derived from timestamped rows that do
 * not move. A STOCK cannot: nothing records that a case was open last Tuesday, only that
 * it is closed now. Backfilling a stock would therefore write TODAY's level under an old
 * date and quietly rewrite history in the one direction nobody would check.
 *
 * Two days covers the intended use — the 00:30 job, and a re-run after it failed — and
 * refuses the rest rather than answering plausibly and wrongly.
 */
export const MAX_SNAPSHOT_BACKFILL_DAYS = 2;

/**
 * Count the organisation-wide figures for one SAST calendar day and store them.
 *
 * Unscoped by design: this is the organisational record, and a cron job has no acting user
 * whose caseload it could be narrowed to. That is also why the stored series is behind
 * `metric:read` and not behind the permission for each underlying collection — a COUNT is
 * not the rows it counted, but it is still more than a volunteer is given.
 *
 * Idempotent: re-running a day corrects its rows via the unique index, never adds to them.
 */
export async function snapshotDailyMetrics({ date = new Date() } = {}) {
  const day = startOfDaySAST(date);
  if (!day) throw AppError.badRequest('A snapshot needs a valid date');

  const today = startOfDaySAST(new Date());
  const daysBack = Math.round((today.getTime() - day.getTime()) / 86_400_000);

  if (daysBack < 0) {
    throw AppError.badRequest('A day that has not happened yet cannot be snapshotted');
  }
  if (daysBack > MAX_SNAPSHOT_BACKFILL_DAYS) {
    throw AppError.badRequest(
      `Metrics can only be recomputed for the last ${MAX_SNAPSHOT_BACKFILL_DAYS} days — a level such as "open cases" cannot be reconstructed for a date further back, only the current one re-dated`
    );
  }

  const { from, to } = sastDayRange(day);
  const now = new Date();
  const openRequest = { deletedAt: null, status: { $nin: TERMINAL_REQUEST_STATUSES } };
  const resolvedToday = {
    deletedAt: null,
    status: 'RESOLVED',
    'resolution.resolvedAt': { $gte: from, $lt: to },
  };

  const [
    activeBeneficiaries,
    registeredToday,
    pendingVerification,
    permitsExpiring,
    openCases,
    escalatedCases,
    closedToday,
    openRequests,
    overdueRequests,
    resolvedRequests,
    referralsToChase,
    activeEnrollments,
    marksToday,
    presentToday,
    upcomingEvents,
    eventAttendance,
    pendingApprovals,
    pendingApprovalValue,
    donationCount,
    donationValue,
    openRequestsByPillar,
    resolvedRequestsByPillar,
  ] = await Promise.all([
    Beneficiary.countDocuments({ deletedAt: null, status: 'ACTIVE' }),
    Beneficiary.countDocuments({ deletedAt: null, createdAt: { $gte: from, $lt: to } }),
    Beneficiary.countDocuments({ deletedAt: null, status: 'PENDING_VERIFICATION' }),
    Beneficiary.countDocuments({
      deletedAt: null,
      status: { $in: ['ACTIVE', 'PENDING_VERIFICATION'] },
      'consent.withdrawnAt': null,
      'immigration.permitExpiresAt': { $ne: null, $lte: new Date(now.getTime() + 30 * 86_400_000) },
    }),

    Case.countDocuments({ deletedAt: null, status: { $in: ACTIVE_CASE_STATUSES } }),
    Case.countDocuments({
      deletedAt: null,
      status: { $in: ACTIVE_CASE_STATUSES },
      priority: { $in: ESCALATED_PRIORITIES },
    }),
    Case.countDocuments({ deletedAt: null, status: 'CLOSED', 'closure.closedAt': { $gte: from, $lt: to } }),

    ServiceRequest.countDocuments(openRequest),
    ServiceRequest.countDocuments({ ...openRequest, dueAt: { $lt: now } }),
    ServiceRequest.countDocuments(resolvedToday),

    Referral.countDocuments({
      deletedAt: null,
      status: { $in: OPEN_REFERRAL_STATUSES },
      followUpAt: { $lt: now },
    }),

    Enrollment.countDocuments({ deletedAt: null, status: { $in: ACTIVE_ENROLLMENT } }),
    // Attendance has no soft delete — a register mark is corrected in place, not removed.
    Attendance.countDocuments({ recordedAt: { $gte: from, $lt: to } }),
    Attendance.countDocuments({
      recordedAt: { $gte: from, $lt: to },
      status: { $in: COUNTS_AS_PRESENT },
    }),

    Event.countDocuments({
      deletedAt: null,
      status: { $in: ['PLANNED', 'CONFIRMED'] },
      startsAt: { $gte: now },
    }),
    sumField(
      Event,
      { deletedAt: null, status: 'COMPLETED', startsAt: { $gte: from, $lt: to } },
      'recordedAttendance'
    ),

    Transaction.countDocuments({ deletedAt: null, status: 'PENDING_APPROVAL' }),
    sumField(Transaction, { deletedAt: null, status: 'PENDING_APPROVAL' }),

    Donation.countDocuments({
      deletedAt: null,
      status: { $in: COUNTS_TOWARDS_TOTALS },
      settledAt: { $gte: from, $lt: to },
    }),
    sumField(Donation, {
      deletedAt: null,
      status: { $in: COUNTS_TOWARDS_TOTALS },
      settledAt: { $gte: from, $lt: to },
    }),

    countByPillar(ServiceRequest, openRequest),
    countByPillar(ServiceRequest, resolvedToday),
  ]);

  const entries = [
    { key: 'beneficiaries.active', value: activeBeneficiaries },
    { key: 'beneficiaries.registered', value: registeredToday },
    { key: 'beneficiaries.pending_verification', value: pendingVerification },
    { key: 'permits.expiring_30d', value: permitsExpiring },
    { key: 'cases.open', value: openCases },
    { key: 'cases.escalated', value: escalatedCases },
    { key: 'cases.closed', value: closedToday },
    { key: 'service_requests.open', value: openRequests },
    { key: 'service_requests.overdue', value: overdueRequests },
    { key: 'service_requests.resolved', value: resolvedRequests },
    { key: 'referrals.awaiting_follow_up', value: referralsToChase },
    { key: 'enrollments.active', value: activeEnrollments },
    { key: 'attendance.marked', value: marksToday },
    { key: 'attendance.present', value: presentToday },
    { key: 'events.upcoming', value: upcomingEvents },
    { key: 'events.attendance', value: eventAttendance },
    { key: 'transactions.pending_approval', value: pendingApprovals },
    { key: 'transactions.pending_approval_value', value: pendingApprovalValue },
    { key: 'donations.settled_count', value: donationCount },
    { key: 'donations.settled_value', value: donationValue },
    // Every pillar is written, zeros included. A missing row is indistinguishable from a
    // pillar that did no work that day, and a five-bar chart that silently becomes four
    // bars reads as though the pillar was discontinued.
    ...pillarEntries('service_requests.open', openRequestsByPillar),
    ...pillarEntries('service_requests.resolved', resolvedRequestsByPillar),
  ];

  const written = await Metric.recordDaily(day, entries);
  return { date: day, metrics: entries.length, written };
}

async function countByPillar(Model, filter) {
  const rows = await Model.aggregate([{ $match: filter }, { $group: { _id: '$pillar', count: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}

function pillarEntries(key, counts) {
  return Object.values(PROGRAMME_PILLARS).map((pillar) => ({
    key,
    dimension: 'pillar',
    dimensionValue: pillar,
    value: counts[pillar] ?? 0,
  }));
}

// --- reading the stored series -----------------------------------------------------

/**
 * A stored series, oldest first — a chart reads forward, unlike every list in this API.
 *
 * `dimension` unset means the organisation-wide rows only. Leaving it out and getting the
 * breakdown mixed in with the totals would double every figure the caller then added up.
 */
export function listMetrics(query = {}) {
  const { key, dimension = null, dimensionValue, from, to, page, limit, sort } = query;

  const filter = { dimension };
  if (dimensionValue) filter.dimensionValue = dimensionValue;

  // One key or several — `?key=cases.open&key=cases.closed` charts two lines. Normalised
  // here as well as in the route schema, because a service is also called directly.
  if (key) {
    const keys = (Array.isArray(key) ? key : [key]).map(assertKnownMetric);
    filter.key = { $in: keys };
  }

  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = startOfDaySAST(from);
    // Inclusive of the end day: a caller asking for 1–31 March means the whole of the 31st.
    if (to) filter.date.$lte = startOfDaySAST(to);
  }

  // lean is safe here and nowhere near the beneficiary register. paginate.js keeps it off
  // by default because a lean result skips the model's toJSON transform, which is what
  // strips permit numbers and vulnerability flags — a Metric row is a date, a key and an
  // integer, and has no such transform to lose.
  /*
   * The one query allowed past PAGINATION.MAX_LIMIT. A chart needs its whole window in one
   * answer, and rows sort by date ASCENDING — so a clamp here does not shorten the series,
   * it returns the oldest slice of it and leaves the caller drawing a stale line with no
   * indication anything was dropped. See PAGINATION.METRIC_MAX_LIMIT for why a metric row
   * may be read in bulk when a beneficiary row may not.
   */
  return paginateQuery(Metric, filter, {
    page,
    limit,
    sort: sort ?? 'date',
    lean: true,
    maxLimit: PAGINATION.METRIC_MAX_LIMIT,
  });
}

/**
 * The metric vocabulary, so a chart's axis labels and its refusal to sum a stock both come
 * from the same source of truth the writers use.
 */
export function listMetricDefinitions() {
  return METRIC_KEYS.map((key) => ({ key, ...METRICS[key] }));
}
