import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { loggerFor } from '../../config/logger.js';
import { rolesWithPermission } from '../../config/permissions.js';
import User from '../users/user.model.js';
import Notification from './notification.model.js';

const log = loggerFor('notification.service');

// Two halves:
//   - the WRITE side (notify*), called by other modules when something happens. Every one
//     of these is best-effort, for the same reason audit writes are: a bell badge that
//     failed to appear must never turn a successful approval into a 500.
//   - the READ side, called by the owner of the notifications and by nobody else.
//
// There is deliberately no public "create a notification" endpoint. Notifications are
// produced by services as a side effect of real events; letting a client post one would
// make the bell menu a channel for anything a compromised account wanted to say.

// --- write ----------------------------------------------------------------------

/**
 * Notify one user.
 *
 * @param {object}  entry
 * @param {*}       entry.userId       recipient — a User document or a bare id
 * @param {string}  entry.title        short, e.g. 'New Staff Access Request'
 * @param {string}  entry.message      one line of context; a pointer, never a disclosure
 * @param {string}  entry.type         one of NOTIFICATION_TYPES
 * @param {*}      [entry.referenceId] the record to open; omitted for SYSTEM
 * @param {string} [entry.priority]    defaults to MEDIUM
 * @returns {Promise<object|null>} the row, or null if the write failed
 */
export async function notify({ userId, title, message, type, referenceId = null, priority }) {
  try {
    return await Notification.create({
      userId: userId?._id ?? userId,
      title,
      message,
      type,
      referenceId,
      ...(priority ? { priority } : {}),
    });
  } catch (err) {
    log.error({ err, type }, 'notification write failed');
    return null;
  }
}

/**
 * Notify a list of users with the same payload. One insertMany rather than N creates —
 * an access request notifies every reviewer, and that should be one round trip.
 */
export async function notifyMany(users, { title, message, type, referenceId = null, priority }) {
  const recipients = (users ?? []).map((u) => u?._id ?? u).filter(Boolean);
  if (recipients.length === 0) return [];

  try {
    return await Notification.insertMany(
      recipients.map((userId) => ({
        userId,
        title,
        message,
        type,
        referenceId,
        ...(priority ? { priority } : {}),
      })),
      // One bad row must not discard the rest — the others are still worth delivering.
      { ordered: false }
    );
  } catch (err) {
    log.error({ err, type, count: recipients.length }, 'bulk notification write failed');
    return [];
  }
}

/**
 * Notify everyone who holds a permission — "tell whoever can review these".
 *
 * Resolved through the permission matrix rather than a role name, so re-granting
 * `access_request:review` re-routes the alert instead of leaving a queue nobody is told
 * about. Only `active` accounts are addressed: an invited or disabled user cannot sign in
 * to read it.
 *
 * @param {string} permission        one of PERMISSIONS
 * @param {object} payload           as notify(), minus `user`
 * @param {*}     [payload.exclude]  a user id to skip, normally the actor themselves
 */
export async function notifyPermission(permission, { exclude, ...payload }) {
  try {
    const roles = rolesWithPermission(permission);
    if (roles.length === 0) return [];

    // Read-only recipient lookup. `_id` alone — this needs an address list, not profiles.
    const filter = { role: { $in: roles }, status: 'active' };
    if (exclude) filter._id = { $ne: exclude?._id ?? exclude };

    const recipients = await User.find(filter).select('_id').lean();
    if (recipients.length === 0) {
      // Worth a line: it means an event that should have been reviewed reached nobody.
      log.warn({ permission, type: payload.type }, 'no active recipients for notification');
      return [];
    }

    return await notifyMany(recipients, payload);
  } catch (err) {
    log.error({ err, permission }, 'permission-addressed notification failed');
    return [];
  }
}

// --- read -----------------------------------------------------------------------
// Every function below is scoped to `actor._id`. That filter IS the access control for
// this module — there is no permission to check, because a notification belongs to
// exactly one person and no role grants sight of anyone else's.

export function listNotifications(query = {}, actor) {
  if (!actor) throw AppError.unauthorized();
  const { page, limit, sort, type, priority, unreadOnly } = query;

  const filter = { userId: actor._id };
  if (type) filter.type = type;
  if (priority) filter.priority = priority;
  if (unreadOnly) filter.isRead = false;

  return paginateQuery(Notification, filter, { page, limit, sort: sort ?? '-createdAt' });
}

/** The bell badge. */
export async function unreadCount(actor) {
  if (!actor) throw AppError.unauthorized();
  const count = await Notification.countDocuments({ userId: actor._id, isRead: false });
  return { unread: count };
}

/**
 * Mark one read. The owner filter is part of the query, not a check after the fetch, so
 * someone else's id reads as "not found" rather than confirming the row exists.
 */
export async function markRead(id, actor) {
  if (!actor) throw AppError.unauthorized();

  const doc = await Notification.findOne({ _id: id, userId: actor._id });
  if (!doc) throw AppError.notFound('Notification');

  if (!doc.isRead) {
    doc.markRead();
    await doc.save();
  }
  return doc;
}

export async function markAllRead(actor) {
  if (!actor) throw AppError.unauthorized();

  const result = await Notification.updateMany(
    { userId: actor._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return { updated: result.modifiedCount ?? 0 };
}
