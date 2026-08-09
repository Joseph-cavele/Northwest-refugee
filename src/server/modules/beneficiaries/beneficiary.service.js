import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { blindIndex } from '../../utils/encrypt.js';
import { daysUntil } from '../../utils/dates.js';
import { hasPermission, scopeToProgrammes, PERMISSIONS } from '../../config/permissions.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
import Beneficiary from './beneficiary.model.js';

// All beneficiary business logic. The only layer that touches the model — controllers
// call these functions and shape the HTTP response, nothing more.

// Row-level scoping, applied to EVERY read. A route guard alone answers "may this role
// call this endpoint"; it does not answer "may this person see this row", and without the
// filter below the rest of the register is one curl away.
const SCOPE_FIELDS = { programmeField: 'programmes', capturedByField: 'capturedBy' };

// Sensitive paths are select:false. Loading them is deliberate and audited.
const SENSITIVE_SELECT =
  '+immigration.permitNumber +immigration.permitNumberIndex +vulnerabilityFlags +contact.email';

function scopedFilter(actor, filter = {}, { includeDeleted = false } = {}) {
  const scoped = scopeToProgrammes(actor, filter, SCOPE_FIELDS);
  return includeDeleted ? scoped : { ...scoped, deletedAt: null };
}

/** Load a record the actor is allowed to see, or 404. Never leaks existence out of scope. */
async function findScopedOrFail(id, actor, { select, includeDeleted = false } = {}) {
  let query = Beneficiary.findOne(scopedFilter(actor, { _id: id }, { includeDeleted }));
  if (select) query = query.select(select);

  const doc = await query.exec();
  // Deliberately a 404, not a 403: telling an out-of-scope caller that the record exists
  // but is not theirs confirms a person is on the register.
  if (!doc) throw AppError.notFound('Beneficiary');
  return doc;
}

function assertCanReadSensitive(actor) {
  if (!hasPermission(actor?.role, PERMISSIONS.BENEFICIARY_READ_SENSITIVE)) {
    throw AppError.forbidden('You do not have permission to read this information');
  }
}

// --- create ----------------------------------------------------------------------

/**
 * Register a beneficiary. `data` is already validated by createBeneficiarySchema — the
 * permit number arrives in the clear and is encrypted by the model's pre-save hook, so
 * this payload must never be logged.
 */
export async function createBeneficiary(data, actor, ctx = {}) {
  const beneficiary = new Beneficiary({
    ...data,
    capturedBy: actor?._id ?? null,
    // A completed intake is awaiting verification by definition. The model's DRAFT default
    // exists for partially captured records; leaving new rows there would mean the
    // verification queue is permanently empty and the permit-expiry job never sees anyone.
    // Unfinished WhatsApp intakes live in the bot's own session model, not here.
    status: 'PENDING_VERIFICATION',
  });

  try {
    await beneficiary.save();
  } catch (err) {
    // referenceCode is random, so a collision is vanishingly rare but not impossible.
    // One retry costs nothing and turns a mystifying 500 into a non-event.
    if (err?.code === 11000 && err?.keyPattern?.referenceCode) {
      beneficiary.referenceCode = undefined;
      await beneficiary.save();
    } else if (err?.code === 11000) {
      throw AppError.conflict('A beneficiary with those details already exists');
    } else {
      throw err;
    }
  }

  await audit.record({
    actor,
    action: ACTIONS.BENEFICIARY_CREATED,
    targetType: 'Beneficiary',
    targetId: beneficiary._id,
    ctx,
    // Reference, never identity: no name, no permit number.
    meta: { referenceCode: beneficiary.referenceCode, intakeChannel: beneficiary.intakeChannel },
  });

  // Consent is the fact an auditor will ask about first, so it gets its own entry.
  await audit.record({
    actor,
    action: ACTIONS.CONSENT_GIVEN,
    targetType: 'Beneficiary',
    targetId: beneficiary._id,
    ctx,
    meta: { method: beneficiary.consent?.method, policyVersion: beneficiary.consent?.policyVersion },
  });

  return beneficiary;
}

// --- read ------------------------------------------------------------------------

export async function listBeneficiaries(query = {}, actor) {
  const {
    page,
    limit,
    sort,
    search,
    status,
    gender,
    immigrationStatus,
    nationality,
    intakeChannel,
    programme,
    assignedOfficer,
    permitExpiringWithinDays,
    includeDeleted,
  } = query;

  const filter = {};
  if (status) filter.status = status;
  if (gender) filter.gender = gender;
  if (immigrationStatus) filter['immigration.status'] = immigrationStatus;
  if (nationality) filter.nationality = nationality;
  if (intakeChannel) filter.intakeChannel = intakeChannel;
  if (programme) filter.programmes = programme;
  if (assignedOfficer) filter.assignedOfficer = assignedOfficer;
  if (search) filter.$text = { $search: search };

  if (permitExpiringWithinDays !== undefined) {
    const horizon = new Date(Date.now() + permitExpiringWithinDays * 86_400_000);
    // Includes already-expired permits: someone whose permit lapsed last week is more
    // urgent than someone whose lapses next month, and must not fall out of the queue.
    filter['immigration.permitExpiresAt'] = { $ne: null, $lte: horizon };
  }

  return paginateQuery(Beneficiary, scopedFilter(actor, filter, { includeDeleted }), {
    page,
    limit,
    sort,
  });
}

export async function getBeneficiaryById(id, actor, { select } = {}) {
  return findScopedOrFail(id, actor, { select });
}

/**
 * Read the special personal information behind a record. Requires
 * beneficiary:read_sensitive and always writes an audit entry — do not add a code path
 * that loads these fields without going through here.
 *
 * Returns the decrypted values explicitly rather than the document, because the model's
 * toJSON strips them: handing back the doc would look like it worked and return nothing.
 */
export async function readSensitive(id, actor, ctx = {}, reason) {
  assertCanReadSensitive(actor);

  const doc = await findScopedOrFail(id, actor, { select: SENSITIVE_SELECT });

  let permitNumber = null;
  let permitDecryptionFailed = false;
  try {
    permitNumber = doc.decryptPermitNumber();
  } catch {
    // A missing or rotated ENCRYPTION_KEY, or a tampered ciphertext. Surface it as a
    // field-level failure rather than a 500 — the rest of the record is still readable,
    // and the caller needs to know this specific value cannot be trusted.
    permitDecryptionFailed = true;
  }

  const fields = ['immigration.permitNumber', 'vulnerabilityFlags', 'contact.email'];
  await audit.recordSensitiveRead({ actor, beneficiaryId: doc._id, fields, reason, ctx });

  return {
    id: doc._id,
    referenceCode: doc.referenceCode,
    permitNumber,
    permitDecryptionFailed,
    vulnerabilityFlags: doc.vulnerabilityFlags ?? [],
    email: doc.contact?.email ?? null,
  };
}

/**
 * Find someone by their permit number. The plaintext is hashed into a blind index and
 * never enters a query — which is also why the caller must send it in a POST body rather
 * than a query string, where it would land in access logs.
 *
 * Searching by permit is itself a sensitive act, so it is permission-checked and audited
 * whether or not it finds anything.
 */
export async function findByPermitNumber(permitNumber, actor, ctx = {}) {
  assertCanReadSensitive(actor);

  const doc = await Beneficiary.findOne(
    scopedFilter(actor, { 'immigration.permitNumberIndex': blindIndex(permitNumber) })
  ).exec();

  await audit.recordSensitiveRead({
    actor,
    beneficiaryId: doc?._id ?? null,
    fields: ['immigration.permitNumberIndex'],
    reason: 'permit lookup',
    ctx,
  });

  if (!doc) throw AppError.notFound('Beneficiary');
  return doc;
}

// --- update ----------------------------------------------------------------------

export async function updateBeneficiary(id, patch, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);

  // Never settable through a general update: identity of the capturer, the reference
  // code, and consent (which has its own withdrawal path).
  const { capturedBy, referenceCode, consent, ...safe } = patch;
  void capturedBy;
  void referenceCode;
  void consent;

  doc.set(safe);
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.BENEFICIARY_UPDATED,
    targetType: 'Beneficiary',
    targetId: doc._id,
    ctx,
    // Which fields changed, never the values — a beneficiary's address is not audit data.
    meta: { fields: Object.keys(safe) },
  });

  return doc;
}

export async function verifyBeneficiary(id, { verified, reason }, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);

  doc.status = verified ? 'ACTIVE' : 'REJECTED';
  doc.verifiedBy = actor._id;
  doc.verifiedAt = new Date();
  if (!verified) doc.notes = [doc.notes, `Rejected: ${reason}`].filter(Boolean).join('\n');
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.BENEFICIARY_UPDATED,
    status: verified ? 'success' : 'failure',
    targetType: 'Beneficiary',
    targetId: doc._id,
    ctx,
    meta: { verified, status: doc.status, ...(reason ? { reason } : {}) },
  });

  return doc;
}

/**
 * Point `immigration.documentId` at the scan of this person's permit, or clear it with
 * null. Called by document.service when a permit document is uploaded or removed, so the
 * case file always resolves to a scan that still exists.
 *
 * The field is select:false, so it is loaded explicitly here — saving a document that was
 * never loaded with the path would leave the old value untouched.
 */
export async function setPermitDocument(id, documentId, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor, { select: '+immigration.documentId' });

  doc.immigration.documentId = documentId;
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.BENEFICIARY_UPDATED,
    targetType: 'Beneficiary',
    targetId: doc._id,
    ctx,
    meta: { permitDocument: documentId ? String(documentId) : null },
  });

  return doc;
}

export async function assignOfficer(id, officerId, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);

  doc.assignedOfficer = officerId;
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.BENEFICIARY_ASSIGNED,
    targetType: 'Beneficiary',
    targetId: doc._id,
    ctx,
    meta: { assignedOfficer: officerId },
  });

  return doc;
}

export async function exitBeneficiary(id, { exitReason, exitAt }, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);

  doc.status = 'EXITED';
  doc.exitReason = exitReason;
  doc.exitAt = exitAt ?? new Date();
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.BENEFICIARY_UPDATED,
    targetType: 'Beneficiary',
    targetId: doc._id,
    ctx,
    meta: { status: 'EXITED', exitReason },
  });

  return doc;
}

/**
 * Withdraw consent. Deliberately NOT a delete: retention may be legally required and a
 * case history is what makes continuity of care possible. It records the withdrawal and
 * deactivates the record so no further processing happens against it.
 */
export async function withdrawConsent(id, { reason } = {}, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);

  if (doc.consent?.withdrawnAt) {
    throw AppError.conflict('Consent has already been withdrawn');
  }

  doc.consent.withdrawnAt = new Date();
  doc.status = 'INACTIVE';
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.CONSENT_WITHDRAWN,
    targetType: 'Beneficiary',
    targetId: doc._id,
    ctx,
    meta: { ...(reason ? { reason } : {}) },
  });

  return doc;
}

/** Soft delete. A purge policy is still owed — see the retention note in CLAUDE.md. */
export async function softDeleteBeneficiary(id, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);

  doc.deletedAt = new Date();
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.BENEFICIARY_UPDATED,
    targetType: 'Beneficiary',
    targetId: doc._id,
    ctx,
    meta: { deleted: true },
  });

  return doc;
}

// --- cross-module reads ----------------------------------------------------------

/**
 * Permits lapsing within `days`, for the permit-expiry job. Unscoped by design: a cron
 * job has no acting user, and the reminder must cover the whole register.
 */
export async function findExpiringPermits(days = 30) {
  const horizon = new Date(Date.now() + days * 86_400_000);
  const docs = await Beneficiary.find({
    deletedAt: null,
    status: { $in: ['ACTIVE', 'PENDING_VERIFICATION'] },
    // Withdrawal stops further processing, and a reminder is processing: messaging someone
    // who asked us to stop is exactly what withdrawing consent forbids.
    'consent.withdrawnAt': null,
    'immigration.permitExpiresAt': { $ne: null, $lte: horizon },
  }).exec();

  return docs.map((doc) => ({
    id: doc._id,
    referenceCode: doc.referenceCode,
    cellphone: doc.contact?.cellphone,
    language: doc.languages?.[0],
    expiresAt: doc.immigration.permitExpiresAt,
    daysRemaining: daysUntil(doc.immigration.permitExpiresAt),
  }));
}
