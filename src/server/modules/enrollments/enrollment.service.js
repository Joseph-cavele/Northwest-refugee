import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { scopeToProgrammes } from '../../config/permissions.js';
import logger from '../../config/logger.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
import { getBeneficiaryById } from '../beneficiaries/beneficiary.service.js';
import { getCohortById } from '../programmes/programme.service.js';
import { Cohort, ProgrammeSession, COHORT_ENROLLABLE } from '../programmes/programme.model.js';
import {
  Enrollment,
  Attendance,
  ACTIVE_ENROLLMENT,
  OCCUPIES_SEAT,
  COUNTS_AS_PRESENT,
} from './enrollment.model.js';

const SCOPE_FIELDS = { programmeField: 'programme', capturedByField: 'capturedBy' };

/** Programme/own-records scope, OR-ed with "you captured it". Same shape as cases. */
function scopedFilter(actor, filter = {}, { includeDeleted = false } = {}) {
  const base = includeDeleted ? { ...filter } : { ...filter, deletedAt: null };
  const scope = scopeToProgrammes(actor, {}, SCOPE_FIELDS);
  if (Object.keys(scope).length === 0) return base;
  return { ...base, $and: [{ $or: [scope, { capturedBy: actor._id }] }] };
}

async function findEnrollmentOrFail(id, actor) {
  const doc = await Enrollment.findOne(scopedFilter(actor, { _id: id })).exec();
  if (!doc) throw AppError.notFound('Enrolment');
  return doc;
}

// --- seat accounting ---------------------------------------------------------------

/**
 * Claim a seat atomically.
 *
 * A read-then-write capacity check loses the race: two officers enrolling the last
 * participant at the same time both read `enrolledCount < capacity` and both write. One
 * conditional update cannot — Mongo applies the $expr guard and the $inc together, so the
 * second returns null.
 */
async function claimSeat(cohortId) {
  const updated = await Cohort.findOneAndUpdate(
    {
      _id: cohortId,
      deletedAt: null,
      status: { $in: COHORT_ENROLLABLE },
      $expr: { $lt: ['$enrolledCount', '$capacity'] },
    },
    { $inc: { enrolledCount: 1 } },
    { returnDocument: 'after' }
  ).exec();
  return updated;
}

/** Give a seat back. Floored at zero so a double release cannot drive the count negative. */
async function releaseSeat(cohortId) {
  await Cohort.updateOne(
    { _id: cohortId, enrolledCount: { $gt: 0 } },
    { $inc: { enrolledCount: -1 } }
  ).exec();
}

// --- enrolment ---------------------------------------------------------------------

export async function enroll(data, actor, ctx = {}) {
  const beneficiary = await getBeneficiaryById(data.beneficiary, actor);
  if (beneficiary.consent?.withdrawnAt) {
    throw AppError.conflict('This beneficiary has withdrawn consent — they cannot be enrolled');
  }

  // Reachable only through a programme the actor can see.
  const cohort = await getCohortById(data.cohort, actor);
  if (!COHORT_ENROLLABLE.includes(cohort.status)) {
    throw AppError.conflict(`A ${cohort.status.toLowerCase()} cohort is not accepting enrolments`);
  }

  const existing = await Enrollment.findOne({
    beneficiary: beneficiary._id,
    cohort: cohort._id,
    status: { $in: OCCUPIES_SEAT },
    deletedAt: null,
  }).exec();
  if (existing) throw AppError.conflict('This person is already enrolled on that cohort');

  const claimed = await claimSeat(cohort._id);
  if (!claimed) {
    throw AppError.conflict(`Cohort is full (${cohort.capacity} places)`);
  }

  let doc;
  try {
    doc = await Enrollment.create({
      ...data,
      beneficiary: beneficiary._id,
      cohort: cohort._id,
      programme: cohort.programme,
      capturedBy: actor._id,
    });
  } catch (err) {
    // The seat is already claimed but no enrolment holds it — hand it back before the
    // error propagates, or the cohort slowly fills with places nobody occupies.
    await releaseSeat(cohort._id).catch((releaseErr) =>
      logger.error({ err: releaseErr, cohort: String(cohort._id) }, 'failed to release a claimed seat')
    );
    if (err?.code === 11000) throw AppError.conflict('This person is already enrolled on that cohort');
    throw err;
  }

  await audit.record({
    actor,
    action: ACTIONS.ENROLLED,
    targetType: 'Enrollment',
    targetId: doc._id,
    ctx,
    meta: {
      beneficiary: String(beneficiary._id),
      cohort: String(cohort._id),
      seatsTaken: claimed.enrolledCount,
      capacity: claimed.capacity,
    },
  });

  return doc;
}

export async function listEnrollments(query = {}, actor) {
  const { page, limit, sort, beneficiary, cohort, programme, status, activeOnly, includeDeleted } = query;

  const filter = {};
  if (beneficiary) filter.beneficiary = beneficiary;
  if (cohort) filter.cohort = cohort;
  if (programme) filter.programme = programme;
  if (status) filter.status = status;
  if (activeOnly) filter.status = status ?? { $in: ACTIVE_ENROLLMENT };

  return paginateQuery(Enrollment, scopedFilter(actor, filter, { includeDeleted }), {
    page,
    limit,
    sort,
    populate: [
      { path: 'beneficiary', select: 'referenceCode firstName lastName' },
      { path: 'cohort', select: 'name startDate endDate status' },
    ],
  });
}

export async function getEnrollmentById(id, actor) {
  return findEnrollmentOrFail(id, actor);
}

export async function updateEnrollment(id, patch, actor, ctx = {}) {
  const doc = await findEnrollmentOrFail(id, actor);

  const before = doc.status;
  const { beneficiary, cohort, programme, capturedBy, ...safe } = patch;
  void beneficiary;
  void cohort;
  void programme;
  void capturedBy;

  if (safe.status && safe.status !== before) {
    if (!ACTIVE_ENROLLMENT.includes(before)) {
      throw AppError.conflict(`A ${before.toLowerCase()} enrolment can no longer change status`);
    }
    if (safe.status === 'COMPLETED') safe.completedAt = new Date();
    if (['WITHDRAWN', 'DROPPED_OUT'].includes(safe.status)) safe.exitedAt = new Date();
  }

  doc.set(safe);
  await doc.save();

  // Leaving frees the place for someone else; completing does not, because that seat was
  // occupied for the whole run.
  if (OCCUPIES_SEAT.includes(before) && !OCCUPIES_SEAT.includes(doc.status)) {
    await releaseSeat(doc.cohort);
  }

  await audit.record({
    actor,
    action: ACTIONS.ENROLLMENT_UPDATED,
    targetType: 'Enrollment',
    targetId: doc._id,
    ctx,
    meta: { from: before, to: doc.status, fields: Object.keys(safe) },
  });

  return doc;
}

// --- attendance --------------------------------------------------------------------

/**
 * Mark a register for one session.
 *
 * Idempotent by design: a facilitator who corrects a mark re-submits the register, and
 * upserting on (session, beneficiary) means the correction replaces the original instead
 * of adding a second row that would inflate the denominator of every attendance rate.
 */
export async function markAttendance(sessionId, marks, actor, ctx = {}) {
  const session = await ProgrammeSession.findOne({ _id: sessionId, deletedAt: null }).exec();
  if (!session) throw AppError.notFound('Session');
  if (session.status === 'CANCELLED') {
    throw AppError.conflict('A cancelled session has no register');
  }

  // Reachable only through a programme the actor can see.
  const cohort = await getCohortById(session.cohort, actor);

  // Everyone marked must actually be on this cohort — marking someone who is not enrolled
  // silently invents a participant in every figure derived from attendance.
  const enrollments = await Enrollment.find({
    cohort: cohort._id,
    beneficiary: { $in: marks.map((m) => m.beneficiary) },
    status: { $in: OCCUPIES_SEAT },
    deletedAt: null,
  }).exec();

  const byBeneficiary = new Map(enrollments.map((e) => [String(e.beneficiary), e]));
  const notEnrolled = marks.filter((m) => !byBeneficiary.has(String(m.beneficiary)));
  if (notEnrolled.length > 0) {
    throw AppError.badRequest(
      `${notEnrolled.length} person(s) in this register are not enrolled on the cohort`
    );
  }

  const operations = marks.map((mark) => {
    const enrollment = byBeneficiary.get(String(mark.beneficiary));
    return {
      updateOne: {
        filter: { session: session._id, beneficiary: mark.beneficiary },
        update: {
          $set: {
            status: mark.status,
            notes: mark.notes ?? '',
            recordedBy: actor._id,
            recordedAt: new Date(),
            enrollment: enrollment._id,
            cohort: cohort._id,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await Attendance.bulkWrite(operations, { ordered: false });

  // Once a register has been taken, the session happened.
  if (session.status === 'SCHEDULED') {
    session.status = 'HELD';
    await session.save();
  }

  await audit.record({
    actor,
    action: ACTIONS.ATTENDANCE_CAPTURED,
    targetType: 'ProgrammeSession',
    targetId: session._id,
    ctx,
    // Counts, never names.
    meta: {
      cohort: String(cohort._id),
      marked: marks.length,
      created: result.upsertedCount ?? 0,
      corrected: result.modifiedCount ?? 0,
    },
  });

  return Attendance.find({ session: session._id })
    .populate('beneficiary', 'referenceCode firstName lastName')
    .sort('beneficiary')
    .exec();
}

export async function listSessionAttendance(sessionId, query = {}, actor) {
  const session = await ProgrammeSession.findOne({ _id: sessionId, deletedAt: null }).exec();
  if (!session) throw AppError.notFound('Session');
  await getCohortById(session.cohort, actor);

  const filter = { session: session._id };
  if (query.status) filter.status = query.status;

  return paginateQuery(Attendance, filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
    populate: { path: 'beneficiary', select: 'referenceCode firstName lastName' },
  });
}

/**
 * Attendance rate for one enrolment.
 *
 * The denominator is sessions actually marked for this person, not every session in the
 * cohort — someone enrolled halfway through would otherwise show a rate that punishes
 * them for meetings held before they joined.
 */
export async function getAttendanceSummary(enrollmentId, actor) {
  const enrollment = await findEnrollmentOrFail(enrollmentId, actor);

  const marks = await Attendance.find({ enrollment: enrollment._id }).select('status').exec();
  const attended = marks.filter((m) => COUNTS_AS_PRESENT.includes(m.status)).length;

  const byStatus = marks.reduce((acc, m) => ({ ...acc, [m.status]: (acc[m.status] ?? 0) + 1 }), {});

  return {
    enrollment: enrollment._id,
    beneficiary: enrollment.beneficiary,
    cohort: enrollment.cohort,
    sessionsMarked: marks.length,
    attended,
    // Null rather than 0 when nothing has been marked: "no data" and "never attended" are
    // different facts, and a funder report must not conflate them.
    attendanceRate: marks.length === 0 ? null : Math.round((attended / marks.length) * 100),
    byStatus,
  };
}
