import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { isProgrammeScoped } from '../../config/permissions.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
import { Programme, Cohort, ProgrammeSession, COHORT_ENROLLABLE } from './programme.model.js';

// Programmes are scoped differently from every other module: a coordinator's User.programmes
// holds programme ids, so the scoping field here is the document's own _id rather than a
// reference to something else.
function programmeFilter(actor, filter = {}) {
  if (!actor) throw AppError.unauthorized();
  const base = { ...filter, deletedAt: null };
  if (!isProgrammeScoped(actor.role)) return base;

  const allowed = { _id: { $in: actor.programmes ?? [] } };

  // Both constraints have to hold, and both are on `_id`. Merging them into one object
  // would let the scope clause overwrite the requested id — so a coordinator asking for
  // someone else's programme would silently receive their own, and a PATCH would edit
  // the wrong record. $and keeps it an intersection.
  return base._id === undefined ? { ...base, ...allowed } : { ...base, $and: [allowed] };
}

async function findProgrammeOrFail(id, actor) {
  const doc = await Programme.findOne(programmeFilter(actor, { _id: id })).exec();
  if (!doc) throw AppError.notFound('Programme');
  return doc;
}

/** A cohort is reachable only through a programme the actor can reach. */
async function findCohortOrFail(cohortId, actor) {
  const cohort = await Cohort.findOne({ _id: cohortId, deletedAt: null }).exec();
  if (!cohort) throw AppError.notFound('Cohort');
  await findProgrammeOrFail(cohort.programme, actor);
  return cohort;
}

async function findSessionOrFail(sessionId, actor) {
  const session = await ProgrammeSession.findOne({ _id: sessionId, deletedAt: null }).exec();
  if (!session) throw AppError.notFound('Session');
  await findCohortOrFail(session.cohort, actor);
  return session;
}

// --- programmes ------------------------------------------------------------------

export async function createProgramme(data, actor, ctx = {}) {
  let doc;
  try {
    doc = await Programme.create({ ...data, createdBy: actor._id });
  } catch (err) {
    if (err?.code === 11000) {
      throw AppError.conflict('A programme with that name already exists under this pillar');
    }
    throw err;
  }

  await audit.record({
    actor,
    action: ACTIONS.PROGRAMME_CREATED,
    targetType: 'Programme',
    targetId: doc._id,
    ctx,
    meta: { name: doc.name, pillar: doc.pillar },
  });

  return doc;
}

export async function listProgrammes(query = {}, actor) {
  const { page, limit, sort, pillar, status, search, includeArchived } = query;

  const filter = {};
  if (pillar) filter.pillar = pillar;
  if (status) filter.status = status;
  if (search) filter.name = { $regex: search, $options: 'i' };
  if (!includeArchived) filter.archivedAt = null;

  return paginateQuery(Programme, programmeFilter(actor, filter), {
    page,
    limit,
    sort,
    populate: { path: 'coordinators', select: 'name role' },
  });
}

export async function getProgrammeById(id, actor) {
  return findProgrammeOrFail(id, actor);
}

export async function updateProgramme(id, patch, actor, ctx = {}) {
  const doc = await findProgrammeOrFail(id, actor);
  if (doc.isArchived) throw AppError.conflict('An archived programme cannot be edited');

  const { pillar, ...safe } = patch;

  if (pillar && pillar !== doc.pillar) {
    // Every enrolment, service request and donor report that already grouped by the old
    // pillar would silently move. Correcting a miscategorised programme is fine while it
    // is still PLANNED; after that it needs a new programme.
    if (doc.status !== 'PLANNED') {
      throw AppError.conflict(
        'A programme can only change pillar while it is still PLANNED — create a new programme instead'
      );
    }
    safe.pillar = pillar;
  }

  doc.set(safe);
  try {
    await doc.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw AppError.conflict('A programme with that name already exists under this pillar');
    }
    throw err;
  }

  await audit.record({
    actor,
    action: ACTIONS.PROGRAMME_UPDATED,
    targetType: 'Programme',
    targetId: doc._id,
    ctx,
    meta: { fields: Object.keys(safe) },
  });

  return doc;
}

/**
 * Archive a programme. Refused while any cohort is still running, because archiving
 * removes it from the coordinator's list and would strand people mid-course.
 */
export async function archiveProgramme(id, actor, ctx = {}) {
  const doc = await findProgrammeOrFail(id, actor);
  if (doc.isArchived) throw AppError.conflict('Programme is already archived');

  const live = await Cohort.countDocuments({
    programme: doc._id,
    deletedAt: null,
    status: { $in: ['PLANNED', 'OPEN', 'RUNNING'] },
  });
  if (live > 0) {
    throw AppError.conflict(`Cannot archive: ${live} cohort(s) are still open or running`);
  }

  doc.archivedAt = new Date();
  doc.status = 'ARCHIVED';
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.PROGRAMME_ARCHIVED,
    targetType: 'Programme',
    targetId: doc._id,
    ctx,
    meta: { name: doc.name },
  });

  return doc;
}

// --- cohorts ---------------------------------------------------------------------

export async function createCohort(programmeId, data, actor, ctx = {}) {
  const programme = await findProgrammeOrFail(programmeId, actor);
  if (programme.isArchived) throw AppError.conflict('An archived programme cannot take new cohorts');

  const cohort = await Cohort.create({ ...data, programme: programme._id, createdBy: actor._id });

  await audit.record({
    actor,
    action: ACTIONS.COHORT_CREATED,
    targetType: 'Cohort',
    targetId: cohort._id,
    ctx,
    meta: { programme: String(programme._id), name: cohort.name },
  });

  return cohort;
}

export async function listCohorts(programmeId, query = {}, actor) {
  const programme = await findProgrammeOrFail(programmeId, actor);

  const { page, limit, sort, status, enrollableOnly } = query;
  const filter = { programme: programme._id, deletedAt: null };
  if (status) filter.status = status;
  if (enrollableOnly) filter.status = status ?? { $in: COHORT_ENROLLABLE };

  return paginateQuery(Cohort, filter, {
    page,
    limit,
    sort,
    populate: { path: 'facilitator', select: 'name role' },
  });
}

export async function getCohortById(cohortId, actor) {
  return findCohortOrFail(cohortId, actor);
}

export async function updateCohort(cohortId, patch, actor, ctx = {}) {
  const cohort = await findCohortOrFail(cohortId, actor);
  if (cohort.status === 'CANCELLED') throw AppError.conflict('A cancelled cohort cannot be edited');
  if (cohort.status === 'COMPLETED' && patch.status !== undefined) {
    throw AppError.conflict('A completed cohort cannot change status');
  }

  // Dates may only move while nobody could have enrolled yet — shifting them under a
  // running cohort invalidates every session already scheduled inside it.
  const movingDates = patch.startDate !== undefined || patch.endDate !== undefined;
  if (movingDates && !COHORT_ENROLLABLE.includes(cohort.status)) {
    throw AppError.conflict('Cohort dates can only change before it starts running');
  }

  cohort.set(patch);
  await cohort.save();

  await audit.record({
    actor,
    action: ACTIONS.COHORT_UPDATED,
    targetType: 'Cohort',
    targetId: cohort._id,
    ctx,
    meta: { fields: Object.keys(patch) },
  });

  return cohort;
}

// --- sessions --------------------------------------------------------------------

export async function scheduleSession(cohortId, data, actor, ctx = {}) {
  const cohort = await findCohortOrFail(cohortId, actor);
  if (['CANCELLED', 'COMPLETED'].includes(cohort.status)) {
    throw AppError.conflict(`A ${cohort.status.toLowerCase()} cohort cannot take new sessions`);
  }

  assertWithinCohort(data.scheduledAt, cohort);

  const session = await ProgrammeSession.create({ ...data, cohort: cohort._id, createdBy: actor._id });

  await audit.record({
    actor,
    action: ACTIONS.SESSION_SCHEDULED,
    targetType: 'ProgrammeSession',
    targetId: session._id,
    ctx,
    meta: { cohort: String(cohort._id), scheduledAt: session.scheduledAt },
  });

  return session;
}

/**
 * A session outside its cohort's dates is a data-entry slip that only shows up when
 * attendance is taken for a day the cohort was not running. The end date is a whole day,
 * so the window runs to the end of it.
 */
function assertWithinCohort(scheduledAt, cohort) {
  const endOfLastDay = new Date(cohort.endDate.getTime() + 86_400_000 - 1);
  if (scheduledAt < cohort.startDate || scheduledAt > endOfLastDay) {
    throw AppError.badRequest(
      `Session must fall within the cohort's dates (${cohort.startDate.toISOString().slice(0, 10)} to ${cohort.endDate.toISOString().slice(0, 10)})`
    );
  }
}

export async function listSessions(cohortId, query = {}, actor) {
  const cohort = await findCohortOrFail(cohortId, actor);

  const { page, limit, sort, status, upcomingOnly } = query;
  const filter = { cohort: cohort._id, deletedAt: null };
  if (status) filter.status = status;
  if (upcomingOnly) {
    filter.scheduledAt = { $gte: new Date() };
    filter.status = status ?? 'SCHEDULED';
  }

  return paginateQuery(ProgrammeSession, filter, {
    page,
    limit,
    sort,
    populate: { path: 'facilitator', select: 'name role' },
  });
}

export async function updateSession(sessionId, patch, actor, ctx = {}) {
  const session = await findSessionOrFail(sessionId, actor);
  if (session.status === 'CANCELLED') throw AppError.conflict('A cancelled session cannot be edited');

  if (patch.scheduledAt) {
    const cohort = await Cohort.findById(session.cohort).exec();
    assertWithinCohort(patch.scheduledAt, cohort);
  }

  session.set(patch);
  await session.save();

  await audit.record({
    actor,
    action: ACTIONS.SESSION_UPDATED,
    targetType: 'ProgrammeSession',
    targetId: session._id,
    ctx,
    meta: { fields: Object.keys(patch), status: session.status },
  });

  return session;
}

// --- cross-module reads ----------------------------------------------------------

/** Cohorts still taking enrolments, for the intake flow. Unscoped by design. */
export async function findEnrollableCohorts() {
  return Cohort.find({ deletedAt: null, status: { $in: COHORT_ENROLLABLE } })
    .populate('programme', 'name pillar status')
    .sort('startDate')
    .exec();
}
