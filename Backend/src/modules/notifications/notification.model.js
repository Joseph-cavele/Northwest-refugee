import mongoose from 'mongoose';
import { NOTIFICATION_TYPES, NOTIFICATION_PRIORITIES } from '../../config/constants.js';

const { Schema } = mongoose;

// One in-app notification collection for the whole system, rather than a table per module.
// `type` says what kind of record this is about — and therefore which collection
// `referenceId` points into — so a click can be routed without a second lookup.
//
// POPIA: `title` and `message` are read from a bell menu, quoted in screenshots and
// forwarded in support tickets. Write them as a pointer, never as a disclosure:
// "A new beneficiary was registered" is correct; the person's name, permit number,
// nationality or vulnerability flags are not. The recipient opens the record — where the
// real access check runs — to see who it is.

const notificationSchema = new Schema(
  {
    // The recipient. Every read path filters on this; it is the only thing separating one
    // staff member's notifications from another's, so it is never optional.
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },

    type: { type: String, enum: NOTIFICATION_TYPES, required: true, index: true },

    /**
     * The record this is about. Deliberately a bare ObjectId with no `ref`: the target
     * collection varies by `type`, so there is no single model to populate from. Resolve
     * it through `type` at the point of use — a populate() here would silently return null.
     *
     * Null for SYSTEM notifications, which are about the platform rather than a record.
     */
    referenceId: { type: Schema.Types.ObjectId, default: null },

    priority: { type: String, enum: NOTIFICATION_PRIORITIES, default: 'MEDIUM', index: true },

    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The bell menu's two queries: the unread badge count, and the newest-first list. Both are
// always scoped to one user, so `userId` leads the compound index.
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

notificationSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

/**
 * Mark read, idempotently. `readAt` is stamped only on the first transition — a second
 * click must not rewrite when the person actually saw it.
 */
notificationSchema.methods.markRead = function markRead() {
  if (this.isRead) return this;
  this.isRead = true;
  this.readAt = new Date();
  return this;
};

const Notification =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

export { NOTIFICATION_TYPES, NOTIFICATION_PRIORITIES };
export default Notification;
