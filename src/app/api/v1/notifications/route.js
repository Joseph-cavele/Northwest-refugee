import { route } from '@/server/http/route';
import { paginated } from '@/server/http/respond';
import * as service from '@/server/modules/notifications/notification.service';
import * as schema from '@/server/modules/notifications/notification.schema';

/*
 * Authenticated, but deliberately NOT permission-guarded.
 *
 * A notification belongs to one person and no role grants sight of anyone else's, so the
 * access control is the `user: actor._id` filter inside the service rather than a
 * permission string. A permission here would be the wrong shape of answer.
 */
export const GET = route(
  { auth: true, query: schema.listNotificationsSchema },
  async ({ query, user }) => paginated(await service.listNotifications(query, user))
);
