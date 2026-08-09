import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as controller from './serviceRequest.controller.js';
import * as schema from './serviceRequest.schema.js';

const router = Router();

router.use(authenticate);

router
  .route('/')
  .post(
    authorize(PERMISSIONS.SERVICE_REQUEST_CREATE),
    validate({ body: schema.createServiceRequestSchema }),
    controller.create
  )
  .get(
    authorize(PERMISSIONS.SERVICE_REQUEST_READ),
    validate({ query: schema.listServiceRequestsSchema }),
    controller.list
  );

router
  .route('/:id')
  .get(
    authorize(PERMISSIONS.SERVICE_REQUEST_READ),
    validate({ params: schema.serviceRequestIdParamSchema }),
    controller.getById
  )
  .patch(
    authorize(PERMISSIONS.SERVICE_REQUEST_UPDATE),
    validate({ params: schema.serviceRequestIdParamSchema, body: schema.updateServiceRequestSchema }),
    controller.update
  );

router.post(
  '/:id/assign',
  authorize(PERMISSIONS.SERVICE_REQUEST_UPDATE),
  validate({ params: schema.serviceRequestIdParamSchema, body: schema.assignServiceRequestSchema }),
  controller.assign
);

// Separate from PATCH so an invalid transition is refused rather than written.
router.post(
  '/:id/status',
  authorize(PERMISSIONS.SERVICE_REQUEST_UPDATE),
  validate({ params: schema.serviceRequestIdParamSchema, body: schema.transitionServiceRequestSchema }),
  controller.transition
);

export default router;
