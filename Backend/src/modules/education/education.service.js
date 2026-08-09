import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { scopeToProgrammes } from '../../config/permissions.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
// Cross-module access is service → service, so a placement can only be recorded against
// a beneficiary the actor is allowed to see.
import { getBeneficiaryById } from '../beneficiaries/beneficiary.service.js';
import {
  SchoolPlacement,
  Cooperative,
  MIN_COOPERATIVE_MEMBERS,
} from './education.model.js';

// NOTE: this file is an addition to the documented tree, which lists education as model +
// routes only. CLAUDE.md forbids route handlers from reaching into models, so the logic
// has to live somewhere below them.

const SCOPE_FIELDS = { programmeField: 'programme', capturedByField: 'capturedBy' };

/**
 * The programme/own-records rule, OR-ed with "you captured it".
 *
 * A placement or a co-op does not always belong to a programme, and without the second
 * arm the coordinator who recorded one could not read it back — the record would be
 * write-only to its own author. Same shape as the case module, for the same reason.
 */
function scopedFilter(actor, filter = {}, { includeDeleted = false } = {}) {
  const base = includeDeleted ? { ...filter } : { ...filter, deletedAt: null };

  // Empty for roles that see everything; the scoping clause alone otherwise.
  const scope = scopeToProgrammes(actor, {}, SCOPE_FIELDS);
  if (Object.keys(scope).length === 0) return base;

  // $and rather than a merge: both clauses can name the same field, and merging would let
  // one silently overwrite the other.
  return { ...base, $and: [{ $or: [scope, { capturedBy: actor._id }] }] };
}

// --- school placements -----------------------------------------------------------

export async function createPlacement(data, actor, ctx = {}) {
  const beneficiary = await getBeneficiaryById(data.beneficiary, actor);

  let doc;
  try {
    doc = await SchoolPlacement.create({
      ...data,
      beneficiary: beneficiary._id,
      capturedBy: actor._id,
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw AppError.conflict(
        `This child already has an active placement for ${data.academicYear}`
      );
    }
    throw err;
  }

  await audit.record({
    actor,
    action: ACTIONS.SCHOOL_PLACEMENT_CREATED,
    targetType: 'SchoolPlacement',
    targetId: doc._id,
    ctx,
    // The school name is not personal information, but the child's is — references only.
    meta: {
      beneficiary: String(beneficiary._id),
      grade: doc.grade,
      academicYear: doc.academicYear,
      status: doc.status,
    },
  });

  return doc;
}

export async function listPlacements(query = {}, actor) {
  const {
    page, limit, sort, beneficiary, status, grade, academicYear,
    unlawfulRefusalsOnly, activeOnly, includeDeleted,
  } = query;

  const filter = {};
  if (beneficiary) filter.beneficiary = beneficiary;
  if (status) filter.status = status;
  if (grade) filter.grade = grade;
  if (academicYear) filter.academicYear = academicYear;
  if (activeOnly) filter.status = status ?? { $in: ['APPLIED', 'PLACED', 'ATTENDING'] };

  // The advocacy queue: children turned away for want of paperwork, which is unlawful.
  if (unlawfulRefusalsOnly) {
    filter.status = 'REFUSED';
    filter['refusal.dueToLackOfDocuments'] = true;
  }

  return paginateQuery(SchoolPlacement, scopedFilter(actor, filter, { includeDeleted }), {
    page,
    limit,
    sort,
    populate: { path: 'beneficiary', select: 'referenceCode firstName lastName' },
  });
}

export async function getPlacementById(id, actor) {
  const doc = await SchoolPlacement.findOne(scopedFilter(actor, { _id: id })).exec();
  if (!doc) throw AppError.notFound('School placement');
  return doc;
}

export async function updatePlacement(id, patch, actor, ctx = {}) {
  const doc = await getPlacementById(id, actor);

  // Never settable through a general update — moving a placement to another child would
  // rewrite two children's education histories at once.
  const { beneficiary, capturedBy, ...safe } = patch;
  void beneficiary;
  void capturedBy;

  // Keep the dates honest rather than trusting the client to send them.
  if (safe.status === 'PLACED' && !doc.placedAt) safe.placedAt = new Date();
  if (['WITHDRAWN', 'COMPLETED', 'REFUSED'].includes(safe.status) && !doc.exitedAt) {
    safe.exitedAt = new Date();
  }

  doc.set(safe);
  try {
    await doc.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw AppError.conflict('This child already has an active placement for that year');
    }
    throw err;
  }

  await audit.record({
    actor,
    action: ACTIONS.SCHOOL_PLACEMENT_UPDATED,
    targetType: 'SchoolPlacement',
    targetId: doc._id,
    ctx,
    meta: {
      fields: Object.keys(safe),
      status: doc.status,
      // Flagged in the trail because it is the fact an advocacy report is built from.
      ...(doc.isUnlawfulRefusal ? { unlawfulRefusal: true } : {}),
    },
  });

  return doc;
}

// --- cooperatives ----------------------------------------------------------------

export async function createCooperative(data, actor, ctx = {}) {
  // Every named member must be a beneficiary the actor can see, checked before anything
  // is written so a partial co-op is never created.
  const members = [];
  for (const member of data.members ?? []) {
    const beneficiary = await getBeneficiaryById(member.beneficiary, actor);
    members.push({ ...member, beneficiary: beneficiary._id });
  }

  assertNoDuplicateMembers(members);

  let doc;
  try {
    doc = await Cooperative.create({ ...data, members, capturedBy: actor._id });
  } catch (err) {
    if (err?.code === 11000) throw AppError.conflict('A cooperative with that name already exists');
    throw err;
  }

  await audit.record({
    actor,
    action: ACTIONS.COOPERATIVE_CREATED,
    targetType: 'Cooperative',
    targetId: doc._id,
    ctx,
    meta: { name: doc.name, sector: doc.sector, memberCount: doc.activeMemberCount },
  });

  return doc;
}

function assertNoDuplicateMembers(members) {
  const ids = members.map((m) => String(m.beneficiary));
  if (new Set(ids).size !== ids.length) {
    throw AppError.badRequest('The same person cannot be listed twice as a member');
  }
}

export async function listCooperatives(query = {}, actor) {
  const { page, limit, sort, status, sector, beneficiary, includeDeleted } = query;

  const filter = {};
  if (status) filter.status = status;
  if (sector) filter.sector = sector;
  if (beneficiary) filter['members.beneficiary'] = beneficiary;

  return paginateQuery(Cooperative, scopedFilter(actor, filter, { includeDeleted }), {
    page,
    limit,
    sort,
    populate: { path: 'members.beneficiary', select: 'referenceCode firstName lastName' },
  });
}

export async function getCooperativeById(id, actor) {
  const doc = await Cooperative.findOne(scopedFilter(actor, { _id: id })).exec();
  if (!doc) throw AppError.notFound('Cooperative');
  return doc;
}

export async function updateCooperative(id, patch, actor, ctx = {}) {
  const doc = await getCooperativeById(id, actor);
  if (doc.status === 'DISSOLVED') throw AppError.conflict('A dissolved cooperative cannot be edited');

  const { members, capturedBy, ...safe } = patch;
  void members; // membership has its own endpoints
  void capturedBy;

  if (safe.status === 'REGISTERED') {
    // The Co-operatives Act requires five natural persons. Recording a co-op as
    // registered below that would put a figure in a donor report that CIPC never granted.
    if (doc.activeMemberCount < MIN_COOPERATIVE_MEMBERS) {
      throw AppError.conflict(
        `A cooperative needs at least ${MIN_COOPERATIVE_MEMBERS} active members to register — it has ${doc.activeMemberCount}`
      );
    }
    if (!doc.registeredAt) safe.registeredAt = new Date();
  }
  if (safe.status === 'DISSOLVED' && !doc.dissolvedAt) safe.dissolvedAt = new Date();

  doc.set(safe);
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.COOPERATIVE_UPDATED,
    targetType: 'Cooperative',
    targetId: doc._id,
    ctx,
    meta: { fields: Object.keys(safe), status: doc.status },
  });

  return doc;
}

export async function addMember(id, member, actor, ctx = {}) {
  const doc = await getCooperativeById(id, actor);
  if (doc.status === 'DISSOLVED') throw AppError.conflict('A dissolved cooperative cannot take members');

  const beneficiary = await getBeneficiaryById(member.beneficiary, actor);

  const active = doc.members.find(
    (m) => String(m.beneficiary) === String(beneficiary._id) && m.exitedAt === null
  );
  if (active) throw AppError.conflict('That person is already a member');

  doc.members.push({ ...member, beneficiary: beneficiary._id, joinedAt: new Date() });
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.COOPERATIVE_UPDATED,
    targetType: 'Cooperative',
    targetId: doc._id,
    ctx,
    meta: { added: String(beneficiary._id), memberCount: doc.activeMemberCount },
  });

  return doc;
}

/**
 * Remove a member. The row is kept with an exit date rather than deleted — who was in a
 * co-op and when is exactly what a funder asks about, and dropping the row would make a
 * past year's membership figure change retrospectively.
 */
export async function removeMember(id, beneficiaryId, actor, ctx = {}) {
  const doc = await getCooperativeById(id, actor);

  const member = doc.members.find(
    (m) => String(m.beneficiary) === String(beneficiaryId) && m.exitedAt === null
  );
  if (!member) throw AppError.notFound('Active member');

  member.exitedAt = new Date();

  // Falling below the statutory minimum does not un-register a co-op, but it is a
  // compliance problem, so it is surfaced rather than silently allowed.
  const remaining = doc.activeMemberCount;
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.COOPERATIVE_UPDATED,
    targetType: 'Cooperative',
    targetId: doc._id,
    ctx,
    meta: {
      removed: String(beneficiaryId),
      memberCount: remaining,
      ...(doc.status === 'REGISTERED' && remaining < MIN_COOPERATIVE_MEMBERS
        ? { belowStatutoryMinimum: true }
        : {}),
    },
  });

  return doc;
}
