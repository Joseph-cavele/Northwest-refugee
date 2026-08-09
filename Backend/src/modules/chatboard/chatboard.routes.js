import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as controller from './chatboard.controller.js';
import * as schema from './chatboard.schema.js';

const router = Router();

router.use(authenticate);

// --- channels --------------------------------------------------------------------

router
  .route('/channels')
  .post(
    authorize(PERMISSIONS.CHATBOARD_MANAGE),
    validate({ body: schema.createChannelSchema }),
    controller.createChannel
  )
  .get(
    authorize(PERMISSIONS.CHATBOARD_READ),
    validate({ query: schema.listChannelsSchema }),
    controller.listChannels
  );

// Messages are declared before /channels/:id so neither path shadows the other.
router
  .route('/channels/:id/messages')
  .post(
    authorize(PERMISSIONS.CHATBOARD_POST),
    validate({ params: schema.channelIdParamSchema, body: schema.postMessageSchema }),
    controller.postMessage
  )
  .get(
    authorize(PERMISSIONS.CHATBOARD_READ),
    validate({ params: schema.channelIdParamSchema, query: schema.listMessagesSchema }),
    controller.listMessages
  );

router.post(
  '/channels/:id/archive',
  authorize(PERMISSIONS.CHATBOARD_MANAGE),
  validate({ params: schema.channelIdParamSchema }),
  controller.archiveChannel
);

router
  .route('/channels/:id')
  .get(
    authorize(PERMISSIONS.CHATBOARD_READ),
    validate({ params: schema.channelIdParamSchema }),
    controller.getChannel
  )
  .patch(
    authorize(PERMISSIONS.CHATBOARD_MANAGE),
    validate({ params: schema.channelIdParamSchema, body: schema.updateChannelSchema }),
    controller.updateChannel
  );

// --- messages --------------------------------------------------------------------
// Only the author may edit, so the guard is chatboard:post — ownership is checked in the
// service. Deletion allows chatboard:manage to remove anyone's message, also in the service.

router
  .route('/messages/:id')
  .patch(
    authorize(PERMISSIONS.CHATBOARD_POST),
    validate({ params: schema.messageIdParamSchema, body: schema.editMessageSchema }),
    controller.editMessage
  )
  .delete(
    authorize(PERMISSIONS.CHATBOARD_POST),
    validate({ params: schema.messageIdParamSchema }),
    controller.deleteMessage
  );

export default router;
