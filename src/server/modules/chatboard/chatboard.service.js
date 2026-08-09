import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { hasPermission, PERMISSIONS } from '../../config/permissions.js';
import { Channel, Message } from './chatboard.model.js';

// NOTE: this file is an addition to the documented tree, which lists chatboard as model +
// routes only. A controller was requested, and CLAUDE.md forbids controllers from
// importing models — so the logic has to live somewhere, and this is that somewhere.
//
// The chatboard is not scoped to a caseload: it is staff-to-staff, and a private channel
// is gated by membership rather than by programme.

const AUTHOR_FIELDS = 'name role';

function slugify(name) {
  const base = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'channel';
}

async function uniqueSlug(name) {
  const base = slugify(name);
  // Collisions are common — "General" and "general " produce the same base — so suffix
  // rather than fail the request.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (!(await Channel.exists({ slug: candidate }))) return candidate;
  }
  throw AppError.conflict('Could not allocate a channel name — try a different one');
}

/** Load a channel the actor may see, or 404. Private channels are members-only. */
async function findVisibleChannelOrFail(id, actor) {
  const channel = await Channel.findById(id).exec();
  if (!channel) throw AppError.notFound('Channel');
  // 404 rather than 403: the existence of a private channel is itself information.
  if (!channel.isVisibleTo(actor._id)) throw AppError.notFound('Channel');
  return channel;
}

// --- channels --------------------------------------------------------------------

export async function createChannel(data, actor) {
  const members = new Set(data.members.map(String));
  // The creator is always a member, otherwise they can lock themselves out of their own
  // private channel on the first request.
  members.add(String(actor._id));

  return Channel.create({
    ...data,
    slug: await uniqueSlug(data.name),
    members: [...members],
    createdBy: actor._id,
  });
}

export async function listChannels(query, actor) {
  const { page, limit, includeArchived, search } = query;

  const filter = {
    // Public channels, plus the private ones this user belongs to.
    $or: [{ isPrivate: false }, { members: actor._id }],
  };
  if (!includeArchived) filter.archivedAt = null;
  if (search) filter.name = { $regex: search, $options: 'i' };

  return paginateQuery(Channel, filter, {
    page,
    limit,
    sort: '-lastMessageAt',
    populate: { path: 'createdBy', select: AUTHOR_FIELDS },
  });
}

export async function getChannel(id, actor) {
  return findVisibleChannelOrFail(id, actor);
}

export async function updateChannel(id, patch, actor) {
  const channel = await findVisibleChannelOrFail(id, actor);
  if (channel.isArchived) throw AppError.conflict('An archived channel cannot be edited');

  channel.set(patch);
  // Renaming leaves the slug alone: links and mentions already point at it, and silently
  // re-slugging would break them.
  await channel.save();
  return channel;
}

export async function archiveChannel(id, actor) {
  const channel = await findVisibleChannelOrFail(id, actor);
  if (channel.isArchived) throw AppError.conflict('Channel is already archived');

  channel.archivedAt = new Date();
  await channel.save();
  return channel;
}

// --- messages --------------------------------------------------------------------

export async function postMessage(channelId, data, actor) {
  const channel = await findVisibleChannelOrFail(channelId, actor);
  if (channel.isArchived) {
    throw AppError.conflict('This channel is archived and accepts no new messages');
  }

  const message = await Message.create({ ...data, channel: channel._id, author: actor._id });

  // Drives the channel list ordering. Not awaited for correctness of the post itself —
  // but awaited here so the list is right on the very next request.
  channel.lastMessageAt = message.createdAt;
  await channel.save();

  return message.populate('author', AUTHOR_FIELDS);
}

export async function listMessages(channelId, query, actor) {
  await findVisibleChannelOrFail(channelId, actor);

  return paginateQuery(
    Message,
    { channel: channelId },
    {
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      populate: { path: 'author', select: AUTHOR_FIELDS },
    }
  );
}

async function findMessageOrFail(id, actor) {
  const message = await Message.findById(id).exec();
  if (!message) throw AppError.notFound('Message');
  // Reuses the channel visibility rule, so a private channel's messages are unreachable
  // by id from outside it.
  await findVisibleChannelOrFail(message.channel, actor);
  return message;
}

/** Only the author may edit, and only their own words — no exception for managers. */
export async function editMessage(id, body, actor) {
  const message = await findMessageOrFail(id, actor);

  if (message.deletedAt) throw AppError.conflict('A deleted message cannot be edited');
  if (String(message.author) !== String(actor._id)) {
    throw AppError.forbidden('You can only edit your own messages');
  }

  message.body = body;
  message.editedAt = new Date();
  await message.save();
  return message.populate('author', AUTHOR_FIELDS);
}

/**
 * Soft delete. The author may remove their own message; chatboard:manage may remove
 * anyone's. The row stays so the thread still reads in order and nobody can quietly
 * rewrite what was agreed — toJSON blanks the body.
 */
export async function deleteMessage(id, actor) {
  const message = await findMessageOrFail(id, actor);
  if (message.deletedAt) throw AppError.conflict('Message is already deleted');

  const isAuthor = String(message.author) === String(actor._id);
  if (!isAuthor && !hasPermission(actor.role, PERMISSIONS.CHATBOARD_MANAGE)) {
    throw AppError.forbidden('You can only delete your own messages');
  }

  message.deletedAt = new Date();
  message.deletedBy = actor._id;
  await message.save();
  return message;
}
