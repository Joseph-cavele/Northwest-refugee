import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { scopeToProgrammes } from '../../config/permissions.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
// Cross-module access is service → service: this is what stops a case being opened
// against a beneficiary the actor is not allowed to see.
import { getBeneficiaryById } from '../beneficiaries/beneficiary.service.js';
import Case, { ESCALATED_PRIORITIES, ACTIVE_STATUSES } from './case.model.js';

// A case carries its own openedBy and programme, so it is scoped directly rather than
// through a join on the beneficiary — which keeps "my caseload" one indexed query.
const SCOPE_FIELDS = { programmeField: 'programme', capturedByField: 'openedBy' };

/**
 * Scope a case query.
 *
 * The ordinary programme/own-records rule applies, OR-ed with "you are the caseworker".
 * Without that second arm a coordinator assigned to a case outside their programmes —
 * or to one with no programme at all — cannot see the file they are answerable for, which
 * is the opposite of what assigning it was meant to achieve.
 */
function scopedFilter(actor, filter = {}, { includeDeleted = false } = {}) {
  const base = includeDeleted ? { ...filter } : { ...filter, deletedAt: null };

  // Empty for roles that see everything; the scoping clause on its own otherwise.
  const scope = scopeToProgrammes(actor, {}, SCOPE_FIELDS);
  if (Object.keys(scope).length === 0) return base;

  // $and keeps this from clobbering any $or the caller may already have built.
  return { ...base, $and: [{ $or: [scope, { caseworker: actor._id }] }] };
}

async function findScopedOrFail(id, actor) {
  const doc = await Case.findOne(scopedFilter(actor, { _id: id })).exec();
  // 404 rather than 403: confirming a case exists but is not yours confirms the person
  // behind it is on the register.
  if (!doc) throw AppError.notFound('Case');
  return doc;
}

// --- open ------------------------------------------------------------------------

/**
 * Open a case. The caseworker defaults to whoever opened it — most cases are opened by
 * the person who will work them, and an unowned case is one nobody is answerable for.
 */
export async function openCase(data, actor, ctx = {}) {
  const beneficiary = await getBeneficiaryById(data.beneficiary, actor);

  if (beneficiary.consent?.withdrawnAt) {
    throw AppError.conflict('This beneficiary has withdrawn consent — no new case may be opened');
  }

  const existing = await Case.findOne({
    beneficiary: beneficiary._id,
    status: { $in: ACTIVE_STATUSES },
    deletedAt: null,
  }).exec();
  if (existing) {
    // Caught here for a readable message; the partial unique index is the real guarantee
    // and holds even against a concurrent second request.
    throw AppError.conflict(`This beneficiary already has an open case (${existing.caseNumber})`);
  }

  let doc;
  try {
    doc = await Case.create({
      ...data,
      beneficiary: beneficiary._id,
      caseworker: data.caseworker ?? actor._id,
      openedBy: actor._id,
      openedAt: new Date(),
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw AppError.conflict('This beneficiary already has an open case');
    }
    throw err;
  }

  await audit.record({
    actor,
    action: ACTIONS.CASE_OPENED,
    targetType: 'Case',
    targetId: doc._id,
    ctx,
    // Codes and references only — the summary can quote a beneficiary verbatim.
    meta: {
      caseNumber: doc.caseNumber,
      beneficiary: String(beneficiary._id),
      category: doc.category,
      priority: doc.priority,
      caseworker: String(doc.caseworker),
    },
  });

  return doc;
}

// --- read ------------------------------------------------------------------------

export async function listCases(query = {}, actor) {
  const {
    page, limit, sort,
    beneficiary, caseworker, status, category, priority,
    mine, urgent, openOnly, includeDeleted,
  } = query;

  const filter = {};
  if (beneficiary) filter.beneficiary = beneficiary;
  if (category) filter.category = category;
  if (priority) filter.priority = priority;
  if (caseworker) filter.caseworker = caseworker;
  // `mine` is the more specific intent, so it wins over an explicit caseworker.
  if (mine) filter.caseworker = actor._id;
  if (status) filter.status = status;

  // Urgent means escalated AND still workable — a closed case is never urgent.
  if (urgent) {
    filter.priority = priority ?? { $in: ESCALATED_PRIORITIES };
    filter.status = status ?? { $in: ACTIVE_STATUSES };
  } else if (openOnly) {
    filter.status = status ?? { $in: ACTIVE_STATUSES };
  }

  return paginateQuery(Case, scopedFilter(actor, filter, { includeDeleted }), {
    page,
    limit,
    // Oldest first in the urgent queue: the case that has waited longest is the one at risk.
    sort: urgent && sort === '-openedAt' ? 'openedAt' : sort,
    populate: [
      { path: 'caseworker', select: 'name role' },
      { path: 'beneficiary', select: 'referenceCode firstName lastName status' },
    ],
  });
}

export async function getCaseById(id, actor) {
  return findScopedOrFail(id, actor);
}

/** HIGH/URGENT and still open, for the daily rollup job. Unscoped: a cron job has no actor. */
export async function findEscalated() {
  return Case.find({
    deletedAt: null,
    status: { $in: ACTIVE_STATUSES },
    priority: { $in: ESCALATED_PRIORITIES },
  })
    .select('caseNumber priority category openedAt caseworker beneficiary')
    .sort('openedAt')
    .exec();
}

// --- update ----------------------------------------------------------------------

export async function updateCase(id, patch, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);
  if (doc.isClosed) throw AppError.conflict('A closed case can no longer be edited');

  // Never settable here: the person it belongs to, who opened it, the status (closing has
  // its own endpoint), and the closure block.
  const { beneficiary, openedBy, status, closure, caseNumber, ...safe } = patch;
  void beneficiary;
  void openedBy;
  void status;
  void closure;
  void caseNumber;

  doc.set(safe);
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.CASE_UPDATED,
    targetType: 'Case',
    targetId: doc._id,
    ctx,
    meta: { caseNumber: doc.caseNumber, fields: Object.keys(safe) },
  });

  return doc;
}

export async function assignCase(id, caseworker, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);
  if (doc.isClosed) throw AppError.conflict('A closed case can no longer be reassigned');

  const from = String(doc.caseworker);
  doc.caseworker = caseworker;
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.CASE_ASSIGNED,
    targetType: 'Case',
    targetId: doc._id,
    ctx,
    meta: { caseNumber: doc.caseNumber, from, to: String(caseworker) },
  });

  return doc;
}

/** Move between OPEN and ON_HOLD. Closing is deliberately not reachable from here. */
export async function setCaseStatus(id, { status }, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);
  if (doc.isClosed) {
    throw AppError.conflict('A closed case cannot be reopened — open a new case instead');
  }
  if (doc.status === status) throw AppError.conflict(`Case is already ${status.toLowerCase()}`);

  const from = doc.status;
  doc.status = status;
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.CASE_UPDATED,
    targetType: 'Case',
    targetId: doc._id,
    ctx,
    meta: { caseNumber: doc.caseNumber, from, to: status },
  });

  return doc;
}

// --- close -----------------------------------------------------------------------

/**
 * Close a case with a recorded outcome.
 *
 * Closing is final. Reopening the same file would let one case be closed twice, and every
 * "cases closed this quarter" figure counts it twice with it — a beneficiary who returns
 * gets a new case, which the partial unique index now permits.
 */
export async function closeCase(id, { outcome, notes }, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);
  if (doc.isClosed) throw AppError.conflict('Case is already closed');

  doc.status = 'CLOSED';
  doc.closure = {
    outcome,
    notes: notes ?? null,
    closedBy: actor._id,
    closedAt: new Date(),
  };
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.CASE_CLOSED,
    targetType: 'Case',
    targetId: doc._id,
    ctx,
    // The outcome and how long it took are the audit facts. The note stays on the record:
    // it can quote a beneficiary directly.
    meta: { caseNumber: doc.caseNumber, outcome, ageDays: doc.ageDays },
  });

  return doc;
}
