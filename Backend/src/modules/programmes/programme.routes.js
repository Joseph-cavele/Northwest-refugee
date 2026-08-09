import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as controller from './programme.controller.js';
import * as schema from './programme.schema.js';

const router = Router();

router.use(authenticate);

// --- cohorts and sessions by their own id -----------------------------------------
// Declared before /:id so neither `/cohorts/…` nor `/sessions/…` is captured as a
// programme id.

router
  .route('/cohorts/:cohortId')
  .get(
    authorize(PERMISSIONS.PROGRAMME_READ),
    validate({ params: schema.cohortIdParamSchema }),
    controller.getCohort
  )
  .patch(
    authorize(PERMISSIONS.PROGRAMME_UPDATE),
    validate({ params: schema.cohortIdParamSchema, body: schema.updateCohortSchema }),
    controller.updateCohort
  );

router
  .route('/cohorts/:cohortId/sessions')
  .post(
    authorize(PERMISSIONS.PROGRAMME_UPDATE),
    validate({ params: schema.cohortIdParamSchema, body: schema.createSessionSchema }),
    controller.scheduleSession
  )
  .get(
    authorize(PERMISSIONS.PROGRAMME_READ),
    validate({ params: schema.cohortIdParamSchema, query: schema.listSessionsSchema }),
    controller.listSessions
  );

router.patch(
  '/sessions/:sessionId',
  authorize(PERMISSIONS.PROGRAMME_UPDATE),
  validate({ params: schema.sessionIdParamSchema, body: schema.updateSessionSchema }),
  controller.updateSession
);

// --- programmes -------------------------------------------------------------------

router
  .route('/')
  .post(
    authorize(PERMISSIONS.PROGRAMME_CREATE),
    validate({ body: schema.createProgrammeSchema }),
    controller.create
  )
  .get(
    authorize(PERMISSIONS.PROGRAMME_READ),
    validate({ query: schema.listProgrammesSchema }),
    controller.list
  );

router
  .route('/:id/cohorts')
  .post(
    authorize(PERMISSIONS.PROGRAMME_UPDATE),
    validate({ params: schema.programmeIdParamSchema, body: schema.createCohortSchema }),
    controller.createCohort
  )
  .get(
    authorize(PERMISSIONS.PROGRAMME_READ),
    validate({ params: schema.programmeIdParamSchema, query: schema.listCohortsSchema }),
    controller.listCohorts
  );

// Archiving removes a programme from every coordinator's list, so it is guarded and
// refused while any cohort is still running.
router.post(
  '/:id/archive',
  authorize(PERMISSIONS.PROGRAMME_UPDATE),
  validate({ params: schema.programmeIdParamSchema }),
  controller.archive
);

router
  .route('/:id')
  .get(
    authorize(PERMISSIONS.PROGRAMME_READ),
    validate({ params: schema.programmeIdParamSchema }),
    controller.getById
  )
  .patch(
    authorize(PERMISSIONS.PROGRAMME_UPDATE),
    validate({ params: schema.programmeIdParamSchema, body: schema.updateProgrammeSchema }),
    controller.update
  );

export default router;
