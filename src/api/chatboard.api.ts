import { api } from './client';
import type { Id, IsoDate } from '@/types/models';
import type { Paginated } from '@/types/api';
import type { Role } from '@/types/enums';

/*
 * The /chatboard endpoints, typed.
 *
 * THIS IS NOT A CASE-NOTES SYSTEM, and the whole module is shaped by that. A message is
 * visible to everyone in its channel, is scoped to no caseload, and has no sensitive-read
 * audit behind it — so anything about a specific person belongs on that person's record
 * instead, where it inherits all three. The server refuses South African ID numbers in a
 * message body outright; features/chatboard/lib/guard.ts mirrors that refusal.
 */

/** Name and role only — the board needs to say who spoke, not hand out a staff directory. */
export interface Author {
  _id: Id;
  name: string;
  role: Role;
}

export interface Channel {
  _id: Id;
  name: string;
  /** Stable handle for links; a rename deliberately leaves it alone. */
  slug: string;
  description: string;
  /**
   * A private channel is readable only by its members, even by someone holding
   * chatboard:read — that permission answers "may they use the board at all".
   */
  isPrivate: boolean;
  members: Id[];
  createdBy: Author | Id;
  /** Archived channels stay readable — a decision recorded in one is still evidence. */
  archivedAt: IsoDate | null;
  isArchived: boolean;
  lastMessageAt: IsoDate | null;
  createdAt: IsoDate;
}

export interface Message {
  _id: Id;
  channel: Id;
  author: Author | Id;
  /**
   * NULL ON A DELETED MESSAGE. The row keeps its slot so the conversation still reads in
   * order, but the content is gone — removing it outright would let someone quietly
   * rewrite what a channel agreed.
   */
  body: string | null;
  mentions: Id[];
  editedAt: IsoDate | null;
  deletedAt: IsoDate | null;
  isEdited: boolean;
  createdAt: IsoDate;
}

export interface ListChannelsQuery {
  page?: number;
  limit?: number;
  includeArchived?: boolean;
  search?: string;
}

/** Public channels, plus the private ones this user belongs to. Ordered by recent activity. */
export function listChannels(
  query: ListChannelsQuery = {},
  signal?: AbortSignal
): Promise<Paginated<Channel>> {
  return api.list<Channel>('/chatboard/channels', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

export function listMessages(
  channelId: Id,
  query: { page?: number; limit?: number; sort?: 'createdAt' | '-createdAt' } = {},
  signal?: AbortSignal
): Promise<Paginated<Message>> {
  return api.list<Message>(`/chatboard/channels/${channelId}/messages`, {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

/**
 * Post to a channel.
 *
 * Refused with a validation error when the body carries an ID number, and with a conflict
 * when the channel is archived. Both are mirrored in the UI so neither costs somebody the
 * message they just typed.
 */
export function postMessage(channelId: Id, body: string, mentions: Id[] = []): Promise<Message> {
  return api.post<Message>(`/chatboard/channels/${channelId}/messages`, { body, mentions });
}

/** Only the author may edit, and only their own words — no exception for managers. */
export function editMessage(id: Id, body: string): Promise<Message> {
  return api.patch<Message>(`/chatboard/messages/${id}`, { body });
}

export const authorOf = (entry: Channel | Message): Author | null => {
  const value = 'author' in entry ? entry.author : entry.createdBy;
  return value && typeof value === 'object' ? value : null;
};
