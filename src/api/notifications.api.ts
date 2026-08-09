import { api } from './client';
import type { Id, IsoDate } from '@/types/models';
import type { NotificationPriority, NotificationType } from '@/types/enums';

/*
 * The /notifications endpoints, typed.
 *
 * Authenticated but not permission-guarded, and deliberately so: a notification belongs to
 * one person and no role grants sight of anyone else's. No route here accepts a user id —
 * the access control is the `user: actor._id` filter inside the service.
 */

export interface NotificationRow {
  _id: Id;
  title: string;
  message: string;
  /**
   * Says which collection `referenceId` points into, so a click can route without a second
   * lookup. SYSTEM carries no referenceId — a digest points at no single record.
   */
  type: NotificationType;
  referenceId: Id | null;
  priority: NotificationPriority;
  isRead: boolean;
  readAt: IsoDate | null;
  createdAt: IsoDate;
}

export interface ListNotificationsQuery {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export function listNotifications(
  query: ListNotificationsQuery = {},
  signal?: AbortSignal
): Promise<NotificationRow[]> {
  return api.get<NotificationRow[]>('/notifications', {
    query: query as Record<string, string | number | boolean>,
    signal,
  });
}

/** The server names this `unread`, not `count` — see notification.service.js. */
export function unreadCount(signal?: AbortSignal): Promise<{ unread: number }> {
  return api.get<{ unread: number }>('/notifications/unread-count', { signal });
}

export function markRead(id: Id): Promise<NotificationRow> {
  return api.patch<NotificationRow>(`/notifications/${id}/read`);
}

export function markAllRead(): Promise<{ updated: number }> {
  return api.post<{ updated: number }>('/notifications/read-all');
}
