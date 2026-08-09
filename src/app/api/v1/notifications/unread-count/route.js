import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import * as service from '@/server/modules/notifications/notification.service';

/** GET /api/v1/notifications/unread-count — the bell badge. */
export const GET = route({ auth: true }, async ({ user }) =>
  success(await service.unreadCount(user))
);
