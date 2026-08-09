import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
import Department, { slugify } from './department.model.js';

// Departments are a directory, not an access boundary — see the note in department.model.js.

/** Both unique indexes on this collection are on a name; either duplicate means the same thing. */
function asConflict(err) {
  if (err?.code === 11000) {
    return AppError.conflict('A department with that name already exists');
  }
  return err;
}

export async function createDepartment(data, actor, ctx = {}) {
  const slug = slugify(data.name);
  // A name of only punctuation ('&&&') slugifies to an empty string, which would then be
  // unique-indexed as '' and collide with the next one.
  if (!slug) throw AppError.badRequest('A department name must contain letters or numbers');

  let doc;
  try {
    doc = await Department.create({ ...data, slug, createdBy: actor._id });
  } catch (err) {
    throw asConflict(err);
  }

  await audit.record({
    actor,
    action: ACTIONS.DEPARTMENT_CREATED,
    targetType: 'Department',
    targetId: doc._id,
    ctx,
    meta: { name: doc.name, slug: doc.slug },
  });

  return doc;
}

export function listDepartments(query = {}) {
  const { page, limit, sort, search, includeInactive } = query;

  const filter = {};
  if (!includeInactive) filter.isActive = true;
  if (search) filter.name = { $regex: search, $options: 'i' };

  return paginateQuery(Department, filter, {
    page,
    limit,
    sort,
    populate: { path: 'head', select: 'name role' },
  });
}

/**
 * The picker list — active departments, id and name only.
 *
 * Used by the public staff access-request form, so it is deliberately narrow: it must
 * never grow to include the head of department, which would hand an unauthenticated
 * caller a partial staff directory.
 */
export function listActiveDepartmentOptions() {
  return Department.find({ isActive: true }).select('name slug').sort('name').lean();
}

export async function getDepartmentById(id) {
  const doc = await Department.findById(id).populate('head', 'name role');
  if (!doc) throw AppError.notFound('Department');
  return doc;
}

/**
 * Assert a department exists and may still be assigned to someone. Called on the access
 * request paths before an applicant or an approver is allowed to point at one.
 */
export async function assertAssignableDepartment(id) {
  const doc = await Department.findById(id).select('_id name isActive');
  if (!doc) throw AppError.notFound('Department');
  if (!doc.isActive) throw AppError.badRequest('That department is no longer active');
  return doc;
}

export async function updateDepartment(id, data, actor, ctx = {}) {
  const doc = await Department.findById(id);
  if (!doc) throw AppError.notFound('Department');

  // `slug` is deliberately not recomputed on rename: it is the stable key behind saved
  // filters and links, and silently changing it breaks them for a cosmetic edit.
  Object.assign(doc, data);

  try {
    await doc.save();
  } catch (err) {
    throw asConflict(err);
  }

  await audit.record({
    actor,
    action: ACTIONS.DEPARTMENT_UPDATED,
    targetType: 'Department',
    targetId: doc._id,
    ctx,
    // Field names, not values — enough to answer "what changed" without copying the record.
    meta: { fields: Object.keys(data), isActive: doc.isActive },
  });

  return doc;
}
