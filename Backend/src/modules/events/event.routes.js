import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/apiResponse.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as service from './event.service.js';
import * as schema from './event.schema.js';

// Thin handlers: validation is in event.schema.js, logic in event.service.js. The tree
// lists this module as model + routes, but the layering rule means a service is required
// and the consent rule on participants is too important to bury in a router.

const ctx = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? '' });

const router = Router();
router.use(authenticate);

router
  .route('/')
  .post(
    authorize(PERMISSIONS.EVENT_CREATE),
    validate({ body: schema.createEventSchema }),
    catchAsync(async (req, res) => sendCreated(res, await service.createEvent(req.body, req.user, ctx(req))))
  )
  .get(
    authorize(PERMISSIONS.EVENT_READ),
    validate({ query: schema.listEventsSchema }),
    catchAsync(async (req, res) => sendPaginated(res, await service.listEvents(req.validatedQuery, req.user)))
  );

// Register and breakdown before /:id so neither is captured as an event id.
router
  .route('/:id/participants')
  .post(
    authorize(PERMISSIONS.EVENT_UPDATE),
    validate({ params: schema.eventIdParamSchema, body: schema.recordParticipantsSchema }),
    catchAsync(async (req, res) =>
      sendSuccess(res, await service.recordParticipants(req.params.id, req.body.participants, req.user, ctx(req))))
  )
  .get(
    authorize(PERMISSIONS.EVENT_READ),
    validate({ params: schema.eventIdParamSchema, query: schema.listParticipantsSchema }),
    catchAsync(async (req, res) =>
      sendPaginated(res, await service.listParticipants(req.params.id, req.validatedQuery, req.user)))
  );

// Aggregated demographics — the shape a funder is shown, with no identities in it.
router.get(
  '/:id/attendance',
  authorize(PERMISSIONS.EVENT_READ),
  validate({ params: schema.eventIdParamSchema }),
  catchAsync(async (req, res) => sendSuccess(res, await service.getAttendanceBreakdown(req.params.id, req.user)))
);

router
  .route('/:id')
  .get(
    authorize(PERMISSIONS.EVENT_READ),
    validate({ params: schema.eventIdParamSchema }),
    catchAsync(async (req, res) => sendSuccess(res, await service.getEventById(req.params.id, req.user)))
  )
  .patch(
    authorize(PERMISSIONS.EVENT_UPDATE),
    validate({ params: schema.eventIdParamSchema, body: schema.updateEventSchema }),
    catchAsync(async (req, res) =>
      sendSuccess(res, await service.updateEvent(req.params.id, req.body, req.user, ctx(req))))
  );

export default router;
