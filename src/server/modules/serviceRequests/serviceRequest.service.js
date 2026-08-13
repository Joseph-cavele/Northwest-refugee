import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { scopeToProgrammes } from '../../config/permissions.js';
import { CATEGORY_PILLAR } from '../../config/constants.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
// Cross-module access is service → service: this is what enforces that a request can only
// be raised against a beneficiary the actor is allowed to see.
import { getBeneficiaryById } from '../beneficiaries/beneficiary.service.js';
import ServiceRequest, { TERMINAL_STATUSES } from './serviceRequest.model.js';

// A service request carries its own capturedBy and programme, so it is scoped directly
// rather than through a join on the beneficiary — which keeps the caseworker queue ("what
// is on my desk") a single indexed query instead of a two-step lookup.
const SCOPE_FIELDS = { programmeField: 'programme', capturedByField: 'capturedBy' };

function scopedFilter(actor, filter = {}, { includeDeleted = false } = {}) {
  const scoped = scopeToProgrammes(actor, filter, SCOPE_FIELDS);
  return includeDeleted ? scoped : { ...scoped, deletedAt: null };
}

async function findScopedOrFail(id, actor, { includeDeleted = false } = {}) {
  const doc = await ServiceRequest.findOne(scopedFilter(actor, { _id: id }, { includeDeleted })).exec();
  // 404 rather than 403: confirming a request exists but is not yours confirms the person
  // behind it is on the register.
  if (!doc) throw AppError.notFound('Service request');
  return doc;
}

// --- create ----------------------------------------------------------------------

export async function createServiceRequest(data, actor, ctx = {}) {
  // Refuse before anything is written if the beneficiary is outside the actor's scope.
  const beneficiary = await getBeneficiaryById(data.beneficiary, actor);

  if (beneficiary.consent?.withdrawnAt) {
    // Consent withdrawal stops further processing. Opening new work against a person who
    // asked us to stop is exactly what it is meant to prevent.
    throw AppError.conflict('This beneficiary has withdrawn consent — no new requests may be raised');
  }

  const doc = await ServiceRequest.create({
    ...data,
    beneficiary: beneficiary._id,
    pillar: CATEGORY_PILLAR[data.category],
    capturedBy: actor._id,
  });

  await audit.record({
    actor,
    action: ACTIONS.SERVICE_REQUEST_CREATED,
    targetType: 'ServiceRequest',
    targetId: doc._id,
    ctx,
    // References and codes only — the description can quote a beneficiary verbatim.
    meta: {
      reference: doc.reference,
      beneficiary: String(beneficiary._id),
      category: doc.category,
      urgency: doc.urgency,
    },
  });

  return doc;
}

// --- read ------------------------------------------------------------------------

export async function listServiceRequests(query = {}, actor) {
  const {
    page, limit, sort,
    beneficiary, status, category, urgency, assignedTo, programme,
    mine, overdue, openOnly, includeDeleted,
  } = query;

  const filter = {};
  if (beneficiary) filter.beneficiary = beneficiary;
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (urgency) filter.urgency = urgency;
  if (programme) filter.programme = programme;
  if (assignedTo) filter.assignedTo = assignedTo;
  // `mine` wins over an explicit assignedTo — it is the more specific intent.
  if (mine) filter.assignedTo = actor._id;

  if (openOnly || overdue) filter.status = status ?? { $nin: TERMINAL_STATUSES };
  // Overdue means past due AND still workable; a resolved request is never overdue.
  if (overdue) filter.dueAt = { $lt: new Date() };

  return paginateQuery(ServiceRequest, scopedFilter(actor, filter, { includeDeleted }), {
    page,
    limit,
    sort,
    /*
     * The same two references case.service.js populates, with the same narrow selects: a
     * queue that cannot name who a request is for is a list of reference codes, and the
     * caller would otherwise fetch each beneficiary separately to caption a row.
     *
     * Name and reference code only. A queue does not need — and must not carry — contact
     * details, dates of birth or immigration status.
     */
    populate: [
      { path: 'beneficiary', select: 'referenceCode firstName lastName status' },
      { path: 'assignedTo', select: 'name role' },
    ],
  });
}

export async function getServiceRequestById(id, actor) {
  return findScopedOrFail(id, actor);
}

// --- update ----------------------------------------------------------------------

export async function updateServiceRequest(id, patch, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);

  if (doc.isTerminal) {
    throw AppError.conflict(`A ${doc.status.toLowerCase()} request can no longer be edited`);
  }

  // Never settable here: the owning person, who raised it, and the status — which has its
  // own endpoint so an invalid jump is refused rather than written.
  const { beneficiary, capturedBy, status, resolution, ...safe } = patch;
  void beneficiary;
  void capturedBy;
  void status;
  void resolution;

  // Re-categorising moves the request to a different pillar, and the SLA follows urgency,
  // so both derived fields are recomputed rather than left stale.
  if (safe.category) safe.pillar = CATEGORY_PILLAR[safe.category];
  if (safe.urgency && safe.urgency !== doc.urgency) {
    safe.dueAt = ServiceRequest.dueDateFor(safe.urgency, doc.createdAt);
  }

  doc.set(safe);
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.SERVICE_REQUEST_UPDATED,
    targetType: 'ServiceRequest',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, fields: Object.keys(safe) },
  });

  return doc;
}

export async function assignServiceRequest(id, assignedTo, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);

  if (doc.isTerminal) {
    throw AppError.conflict(`A ${doc.status.toLowerCase()} request can no longer be assigned`);
  }

  doc.assignedTo = assignedTo;
  // Picking up unassigned work is what moves it out of the triage queue.
  if (assignedTo && doc.status === 'OPEN') doc.status = 'IN_PROGRESS';
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.SERVICE_REQUEST_ASSIGNED,
    targetType: 'ServiceRequest',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, assignedTo: assignedTo ? String(assignedTo) : null },
  });

  return doc;
}

/**
 * Move a request to a new status.
 *
 * Transitions are checked against the model's table, so a resolved request cannot be
 * resolved again — which would double-count it in every throughput figure reported to a
 * funder — and a cancelled one cannot be quietly revived.
 */
export async function transitionServiceRequest(id, { status, notes, referral }, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);

  if (doc.status === status) {
    throw AppError.conflict(`Request is already ${status.toLowerCase()}`);
  }
  if (!ServiceRequest.canTransition(doc.status, status)) {
    const allowed = ServiceRequest.allowedTransitions(doc.status);
    throw AppError.conflict(
      allowed.length
        ? `Cannot move a ${doc.status.toLowerCase()} request to ${status.toLowerCase()} — allowed: ${allowed.join(', ')}`
        : `A ${doc.status.toLowerCase()} request is final and cannot be changed`
    );
  }

  const from = doc.status;
  doc.status = status;

  if (TERMINAL_STATUSES.includes(status)) {
    doc.resolution.notes = notes ?? null;
    doc.resolution.resolvedBy = actor._id;
    doc.resolution.resolvedAt = new Date();
  }
  if (status === 'REFERRED') doc.referral = referral;

  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.SERVICE_REQUEST_STATUS_CHANGED,
    targetType: 'ServiceRequest',
    targetId: doc._id,
    ctx,
    // The transition itself is the audit fact; the note stays on the record, not in the
    // trail, because it can quote a beneficiary directly.
    meta: { reference: doc.reference, from, to: status },
  });

  return doc;
}

// --- cross-module reads ----------------------------------------------------------

/**
 * Open requests past their due date, for the daily rollup job. Unscoped by design: a cron
 * job has no acting user and the figure must cover the whole organisation.
 */
export async function findOverdue(asOf = new Date()) {
  return ServiceRequest.find({
    deletedAt: null,
    status: { $nin: TERMINAL_STATUSES },
    dueAt: { $lt: asOf },
  })
    .select('reference category urgency dueAt assignedTo beneficiary')
    .exec();
}
