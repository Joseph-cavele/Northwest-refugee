import mongoose from 'mongoose';
import AuditLog, { ACTIONS } from './audit.model.js';
import { paginateQuery } from '../../utils/paginate.js';

// The only sanctioned way to write the audit trail. Every entry is best-effort: auditing
// must never break the request it records, so AuditLog.record swallows its own failures.
//
// POPIA: `meta` carries references, never payloads. A permit number, an ID number or the
// contents of a document must never reach an audit row — the trail is read by more people,
// and kept longer, than the record it describes.

/**
 * @param {object}  entry
 * @param {object}  entry.actor      the acting user, or null for system/anonymous
 * @param {string}  entry.action     one of ACTIONS
 * @param {string} [entry.status]    'success' (default) or 'failure'
 * @param {object} [entry.ctx]       { ip, userAgent } from the request
 */
/**
 * An actor is a User document, a bare id, or a system actor with no id at all — the
 * WhatsApp bot has no User row. `actor?._id ?? actor` would fall through to the object
 * itself when _id is null, and Mongo would reject it.
 */
function actorId(actor) {
  if (!actor) return null;
  if (typeof actor === 'object') return actor._id ?? null;
  return actor;
}

export function record({ actor, action, status = 'success', targetType, targetId, ctx = {}, meta = {} }) {
  return AuditLog.record({
    actor: actorId(actor),
    action,
    status,
    targetType: targetType ?? null,
    targetId: targetId ?? null,
    ip: ctx.ip ?? '',
    userAgent: ctx.userAgent ?? '',
    meta,
  });
}

/**
 * Record that someone read special personal information — a permit number or a
 * vulnerability flag. CLAUDE.md requires this on every such read, and it is the reason
 * those fields are select:false: loading them has to be a deliberate act that leaves a
 * trace, not an incidental side effect of a convenient query.
 *
 * `fields` records WHICH categories were read, never their values.
 */
export function recordSensitiveRead({ actor, beneficiaryId, fields = [], reason, ctx = {} }) {
  return record({
    actor,
    action: ACTIONS.SENSITIVE_READ,
    targetType: 'Beneficiary',
    targetId: beneficiaryId,
    ctx,
    meta: { fields, ...(reason ? { reason } : {}) },
  });
}

/** Record a refused action. A pattern of denials is itself a security signal. */
export function recordDenial({ actor, action, targetType, targetId, ctx = {}, meta = {} }) {
  return record({ actor, action, status: 'failure', targetType, targetId, ctx, meta });
}

/**
 * `targetId` is Mixed on purpose — it holds an internal ObjectId for our own records and a
 * plain string for an external provider reference. Mongoose applies NO casting to a Mixed
 * path, so a hex string arriving from a query parameter will never equal a stored
 * ObjectId. Matching both is what stops "everything that happened to this record" from
 * silently returning an empty page.
 */
function targetIdFilter(value) {
  const raw = String(value);
  if (!mongoose.Types.ObjectId.isValid(raw) || raw.length !== 24) return raw;
  return { $in: [raw, new mongoose.Types.ObjectId(raw)] };
}

/**
 * Read the trail. Append-only at the model layer, so this is the only access it has —
 * there is deliberately no update or delete counterpart.
 */
export function listAuditEntries(query = {}) {
  const { actor, action, targetType, targetId, status, from, to, page, limit, sort } = query;

  const filter = {};
  if (actor) filter.actor = actor;
  if (action) filter.action = action;
  if (targetType) filter.targetType = targetType;
  if (targetId) filter.targetId = targetIdFilter(targetId);
  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  return paginateQuery(AuditLog, filter, {
    page,
    limit,
    sort: sort ?? '-createdAt',
    // Name and role only. An audit view exists to answer "who did this" — it does not
    // need to hand out every reader a directory of staff email addresses.
    populate: { path: 'actor', select: 'name role' },
  });
}

/**
 * The full action vocabulary, so a filter dropdown is built from the same source of truth
 * the writers use rather than from a list that drifts out of date.
 */
export function listActions() {
  return Object.values(ACTIONS).sort();
}

export { ACTIONS };
