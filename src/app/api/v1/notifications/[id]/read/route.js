import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import * as service from '@/server/modules/notifications/notification.service';
import * as schema from '@/server/modules/notifications/notification.schema';

/** PATCH /api/v1/notifications/:id/read */
export const PATCH = route(
  { auth: true, params: schema.notificationIdParamSchema },
  async ({ params, user }) => success(await service.markRead(params.id, user))
);
