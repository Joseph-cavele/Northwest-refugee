import type { Metadata } from 'next';
import { NotificationList } from '@/features/notifications/NotificationList';

export const metadata: Metadata = { title: 'Notifications' };

/*
 * NO RequirePermission, and that is the right shape rather than an omission.
 *
 * A notification belongs to one person, and no role grants sight of anyone else's. The
 * routes accept no user id at all — the access control is the `userId: actor._id` filter
 * inside the service — so a permission string here would be answering a question nobody
 * asked. Being signed in is the whole of the requirement, and the dashboard layout's
 * RequireAuth already establishes that.
 */
export default function NotificationsPage() {
  return <NotificationList />;
}
