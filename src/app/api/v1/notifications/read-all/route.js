import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import * as service from '@/server/modules/notifications/notification.service';

/** POST /api/v1/notifications/read-all */
export const POST = route({ auth: true }, async ({ user }) =>
  success(await service.markAllRead(user))
);
