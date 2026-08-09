import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { scopeToProgrammes } from '../../config/permissions.js';
import { CATEGORY_PILLAR } from '../../config/constants.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
import { notify } from '../notifications/notification.service.js';
// Cross-module access is service → service: these are what enforce that a referral can
// only be raised against a beneficiary — and filed under a case or request — the actor is
// already allowed to see.
import { getBeneficiaryById } from '../beneficiaries/beneficiary.service.js';
import { getCaseById } from '../cases/case.service.js';
import { getServiceRequestById } from '../serviceRequests/serviceRequest.service.js';
import Referral, { TERMINAL_STATUSES, OPEN_STATUSES } from './referral.model.js';

// A referral carries its own referredBy and programme, so it is scoped directly rather
// than through a join on the beneficiary — which keeps the follow-up queue one indexed
// query instead of a two-step lookup.
const SCOPE_FIELDS = { programmeField: 'programme', capturedByField: 'referredBy' };

function scopedFilter(actor, filter = {}, { includeDeleted = false } = {}) {
  const scoped = scopeToProgrammes(actor, filter, SCOPE_FIELDS);
  return includeDeleted ? scoped : { ...scoped, deletedAt: null };
}

async function findScopedOrFail(id, actor, { includeDeleted = false } = {}) {
  const doc = await Referral.findOne(scopedFilter(actor, { _id: id }, { includeDeleted })).exec();
  // 404 rather than 403: confirming a referral exists but is not yours confirms the person
  // behind it is on the register — and, with it, which organisation they were sent to.
  if (!doc) throw AppError.notFound('Referral');
  return doc;
}

/**
 * Tell the officer who made the referral that someone else recorded the answer.
 *
 * Best-effort, like every notification write. The message names the organisation and the
 * outcome and nothing else: a bell menu is read over someone's shoulder in an open-plan
 * office, so it is a pointer, never a disclosure.
 */
async function notifyReferrer(doc, actor) {
  if (!doc.referredBy || String(doc.referredBy) === String(actor._id)) return;

  // A high-urgency referral that was refused or went cold is where people fall through;
  // everything else can wait for the officer to open the queue.
  const escalated =
    ['DECLINED', 'LOST_TO_FOLLOW_UP'].includes(doc.status) &&
    ['HIGH', 'URGENT'].includes(doc.urgency);

  await notify({
    userId: doc.referredBy,
    title: `Referral ${doc.status.toLowerCase().replace(/_/g, ' ')}`,
    message: `${doc.reference} — ${doc.organisation.name}`,
    type: 'REFERRAL',
    referenceId: doc._id,
    priority: escalated ? 'HIGH' : undefined,
  });
}

// --- create ----------------------------------------------------------------------

/**
 * Refuse a link to a case or request that belongs to someone else.
 *
 * Both lookups run through their own service, so an id the actor may not see 404s before
 * anything is written. The beneficiary comparison is the second half: a referral filed
 * under another person's case is a record two histories are then wrong about.
 */
async function assertLinkBelongsTo(beneficiaryId, { caseId, serviceRequestId }, actor) {
  if (caseId) {
    const linked = await getCaseById(caseId, actor);
    if (String(linked.beneficiary) !== String(beneficiaryId)) {
      throw AppError.conflict('That case belongs to a different beneficiary');
    }
  }
  if (serviceRequestId) {
    const linked = await getServiceRequestById(serviceRequestId, actor);
    if (String(linked.beneficiary) !== String(beneficiaryId)) {
      throw AppError.conflict('That service request belongs to a different beneficiary');
    }
  }
}

export async function createReferral(data, actor, ctx = {}) {
  // Refuse before anything is written if the beneficiary is outside the actor's scope.
  const beneficiary = await getBeneficiaryById(data.beneficiary, actor);

  if (beneficiary.consent?.withdrawnAt) {
    // Withdrawal stops further processing, and a referral is processing at its most
    // consequential: it puts this person's details in front of an outside organisation.
    throw AppError.conflict(
      'This beneficiary has withdrawn consent — they may not be referred anywhere'
    );
  }

  await assertLinkBelongsTo(
    beneficiary._id,
    { caseId: data.case, serviceRequestId: data.serviceRequest },
    actor
  );

  const { informationSharing, ...rest } = data;

  const doc = await Referral.create({
    ...rest,
    beneficiary: beneficiary._id,
    pillar: CATEGORY_PILLAR[data.category],
    referredBy: actor._id,
    referredAt: new Date(),
    // Whoever captured the consent is who the Information Regulator would ask about it.
    informationSharing: informationSharing
      ? { ...informationSharing, givenAt: new Date(), witnessedBy: actor._id }
      : null,
  });

  await audit.record({
    actor,
    action: ACTIONS.REFERRAL_CREATED,
    targetType: 'Referral',
    targetId: doc._id,
    ctx,
    // References and codes only — `reason` can quote a beneficiary verbatim. The consent
    // method is here because "on what basis was this disclosed" is the first question an
    // auditor asks about an outbound referral.
    meta: {
      reference: doc.reference,
      beneficiary: String(beneficiary._id),
      direction: doc.direction,
      organisation: doc.organisation.name,
      organisationType: doc.organisation.type,
      category: doc.category,
      urgency: doc.urgency,
      consentMethod: doc.informationSharing?.method ?? null,
    },
  });

  return doc;
}

// --- read ------------------------------------------------------------------------

export async function listReferrals(query = {}, actor) {
  const {
    page, limit, sort,
    beneficiary, case: caseId, serviceRequest, status, direction, category, urgency,
    organisationType, programme, mine, openOnly, overdue, includeDeleted,
  } = query;

  const filter = {};
  if (beneficiary) filter.beneficiary = beneficiary;
  if (caseId) filter.case = caseId;
  if (serviceRequest) filter.serviceRequest = serviceRequest;
  if (status) filter.status = status;
  if (direction) filter.direction = direction;
  if (category) filter.category = category;
  if (urgency) filter.urgency = urgency;
  if (organisationType) filter['organisation.type'] = organisationType;
  if (programme) filter.programme = programme;
  if (mine) filter.referredBy = actor._id;

  if (openOnly || overdue) filter.status = status ?? { $in: OPEN_STATUSES };
  // Overdue means past the follow-up date AND still open; a closed referral is never
  // waiting on anybody.
  if (overdue) filter.followUpAt = { $lt: new Date() };

  return paginateQuery(Referral, scopedFilter(actor, filter, { includeDeleted }), {
    page,
    limit,
    sort,
    populate: [
      { path: 'referredBy', select: 'name role' },
      { path: 'beneficiary', select: 'referenceCode firstName lastName status' },
    ],
  });
}

export async function getReferralById(id, actor) {
  return findScopedOrFail(id, actor);
}

// --- update ----------------------------------------------------------------------

export async function updateReferral(id, patch, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);

  if (doc.isTerminal) {
    throw AppError.conflict(`A ${doc.status.toLowerCase()} referral can no longer be edited`);
  }

  // Never settable here. The schema already omits them; this is the second lock, because
  // a service must hold on its own for any caller that reaches it without a router.
  const { beneficiary, direction, referredBy, status, informationSharing, outcome, ...safe } = patch;
  void beneficiary;
  void direction;
  void referredBy;
  void status;
  void informationSharing;
  void outcome;

  // Re-linking is reachable from here, so the ownership check runs again. Without it the
  // rule enforced at creation would be one PATCH away from being bypassed.
  await assertLinkBelongsTo(doc.beneficiary, { caseId: safe.case, serviceRequestId: safe.serviceRequest }, actor);

  // Re-categorising moves the referral to a different pillar, and the chase date follows
  // urgency, so both derived fields are recomputed rather than left stale.
  if (safe.category) safe.pillar = CATEGORY_PILLAR[safe.category];
  if (safe.urgency && safe.urgency !== doc.urgency) {
    safe.followUpAt = Referral.followUpDateFor(safe.urgency, doc.referredAt);
  }

  // A nested object rather than a subdocument, so setting it path by path merges the new
  // contact details in. Assigning the object whole would drop the organisation's name and
  // type — the two fields the update schema refuses to accept in the first place.
  const { organisation, ...scalars } = safe;
  doc.set(scalars);
  for (const [key, value] of Object.entries(organisation ?? {})) {
    doc.set(`organisation.${key}`, value);
  }
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.REFERRAL_UPDATED,
    targetType: 'Referral',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, fields: Object.keys(safe) },
  });

  return doc;
}

/**
 * Move a referral to a new status.
 *
 * Transitions are checked against the model's table, so a completed referral cannot be
 * completed twice — which would double-count it in every onward-referral figure a funder
 * reads — and a declined one cannot be quietly revived to improve a partner's numbers.
 */
export async function transitionReferral(id, { status, notes }, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);

  if (doc.status === status) {
    throw AppError.conflict(`Referral is already ${status.toLowerCase().replace(/_/g, ' ')}`);
  }
  if (!Referral.canTransition(doc.status, status)) {
    const allowed = Referral.allowedTransitions(doc.status);
    throw AppError.conflict(
      allowed.length
        ? `Cannot move a ${doc.status.toLowerCase()} referral to ${status.toLowerCase()} — allowed: ${allowed.join(', ')}`
        : `A ${doc.status.toLowerCase()} referral is final and cannot be changed`
    );
  }

  const from = doc.status;
  doc.status = status;

  // Accepting and declining are both answers; only one of them is a good one.
  if (['ACCEPTED', 'DECLINED'].includes(status) && !doc.respondedAt) doc.respondedAt = new Date();

  if (TERMINAL_STATUSES.includes(status)) {
    doc.outcome.notes = notes ?? null;
    doc.outcome.recordedBy = actor._id;
    doc.outcome.recordedAt = new Date();
    doc.closedAt = new Date();
  }

  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.REFERRAL_STATUS_CHANGED,
    targetType: 'Referral',
    targetId: doc._id,
    ctx,
    // The transition and how long the organisation took are the audit facts. The note
    // stays on the record: it can quote a beneficiary, or a clerk, directly.
    meta: {
      reference: doc.reference,
      organisationType: doc.organisation.type,
      from,
      to: status,
      ageDays: doc.ageDays,
    },
  });

  await notifyReferrer(doc, actor);

  return doc;
}

// --- cross-module reads ----------------------------------------------------------

/**
 * Open referrals past their follow-up date, for the daily rollup job. Unscoped by design:
 * a cron job has no acting user and the figure must cover the whole organisation.
 */
export async function findAwaitingFollowUp(asOf = new Date()) {
  return Referral.find({
    deletedAt: null,
    status: { $in: OPEN_STATUSES },
    followUpAt: { $lt: asOf },
  })
    .select('reference organisation category urgency followUpAt referredBy beneficiary')
    .sort('followUpAt')
    .exec();
}
