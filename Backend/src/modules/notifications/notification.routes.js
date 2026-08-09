import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './notification.controller.js';
import * as schema from './notification.schema.js';

const router = Router();

// Authenticated, but deliberately NOT permission-guarded. A notification belongs to one
// person and no role grants sight of anyone else's, so the access control is the
// `user: actor._id` filter inside the service rather than a permission string.
router.use(authenticate);

// Static paths before /:id — `/unread-count` and `/read-all` would otherwise be parsed as
// notification ids and fail validation.
router.get('/unread-count', controller.unreadCount);
router.post('/read-all', controller.markAllRead);

router.get('/', validate({ query: schema.listNotificationsSchema }), controller.list);

router.patch(
  '/:id/read',
  validate({ params: schema.notificationIdParamSchema }),
  controller.markRead
);

export default router;
