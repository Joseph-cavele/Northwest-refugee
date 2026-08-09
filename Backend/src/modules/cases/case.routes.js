import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as controller from './case.controller.js';
import * as schema from './case.schema.js';

const router = Router();

router.use(authenticate);

// Static before /:id — otherwise /urgent arrives as id='urgent'.
router.get(
  '/urgent',
  authorize(PERMISSIONS.CASE_READ),
  validate({ query: schema.listCasesSchema }),
  controller.urgent
);

router
  .route('/')
  .post(
    authorize(PERMISSIONS.CASE_CREATE),
    validate({ body: schema.openCaseSchema }),
    controller.open
  )
  .get(
    authorize(PERMISSIONS.CASE_READ),
    validate({ query: schema.listCasesSchema }),
    controller.list
  );

router
  .route('/:id')
  .get(
    authorize(PERMISSIONS.CASE_READ),
    validate({ params: schema.caseIdParamSchema }),
    controller.getById
  )
  .patch(
    authorize(PERMISSIONS.CASE_UPDATE),
    validate({ params: schema.caseIdParamSchema, body: schema.updateCaseSchema }),
    controller.update
  );

router.post(
  '/:id/assign',
  authorize(PERMISSIONS.CASE_UPDATE),
  validate({ params: schema.caseIdParamSchema, body: schema.assignCaseSchema }),
  controller.assign
);

// OPEN ↔ ON_HOLD only. Closing is a different permission and a different endpoint.
router.post(
  '/:id/status',
  authorize(PERMISSIONS.CASE_UPDATE),
  validate({ params: schema.caseIdParamSchema, body: schema.reopenHoldSchema }),
  controller.setStatus
);

// Its own permission: a closed case drops out of every active-caseload figure, so closing
// is not something everyone who can edit a case should be able to do.
router.post(
  '/:id/close',
  authorize(PERMISSIONS.CASE_CLOSE),
  validate({ params: schema.caseIdParamSchema, body: schema.closeCaseSchema }),
  controller.close
);

export default router;
