import mongoose from 'mongoose';

const { Schema } = mongoose;

// Internal staff message board. Channels group the conversation; messages live inside one.
//
// This is NOT a case-notes system. Anything about a specific person belongs on that
// person's record, where it inherits row-level scoping and the audit trail. A chatboard
// message is visible to everyone in the channel and is not scoped to a caseload — which is
// why the schema layer refuses South African ID numbers outright.

// --- Channel --------------------------------------------------------------------

const channelSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // Stable handle for links and mentions; the display name can change without breaking them.
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, trim: true, maxlength: 300, default: '' },

    // A private channel is readable only by its members, even by a role that holds
    // chatboard:read. The permission answers "may they use the board at all".
    isPrivate: { type: Boolean, default: false, index: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Archived channels stay readable — a decision recorded in one is still evidence —
    // but accept no new messages.
    archivedAt: { type: Date, default: null, index: true },
    lastMessageAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

channelSchema.index({ archivedAt: 1, lastMessageAt: -1 });

channelSchema.virtual('isArchived').get(function isArchived() {
  return this.archivedAt !== null;
});

/** Members-only for a private channel; open to any chatboard reader otherwise. */
channelSchema.methods.isVisibleTo = function isVisibleTo(userId) {
  if (!this.isPrivate) return true;
  return this.members.some((m) => String(m._id ?? m) === String(userId));
};

// --- Message --------------------------------------------------------------------

const messageSchema = new Schema(
  {
    channel: { type: Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },

    // Referenced by code, never by name — see the note at the top of this file.
    mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    editedAt: { type: Date, default: null },
    // Soft delete: removing a message outright would let someone quietly rewrite what was
    // agreed in a channel.
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

messageSchema.index({ channel: 1, createdAt: -1 });

messageSchema.virtual('isEdited').get(function isEdited() {
  return this.editedAt !== null;
});

messageSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    // A deleted message keeps its slot in the thread so the conversation still reads in
    // order, but its content is gone.
    if (ret.deletedAt) ret.body = null;
    delete ret.__v;
    return ret;
  },
});

channelSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export const Channel = mongoose.models.Channel || mongoose.model('Channel', channelSchema);
export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);
