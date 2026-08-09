import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as controller from './enrollment.controller.js';
import * as schema from './enrollment.schema.js';

const router = Router();

router.use(authenticate);

// --- attendance -------------------------------------------------------------------
// Declared before /:id so `/sessions/…` is never captured as an enrolment id.
//
// attendance:capture is deliberately wider than enrollment:create — volunteers and peer
// leaders mark registers in the field but cannot enrol anyone.

router
  .route('/sessions/:sessionId/attendance')
  .post(
    authorize(PERMISSIONS.ATTENDANCE_CAPTURE),
    validate({ params: schema.sessionIdParamSchema, body: schema.markAttendanceSchema }),
    controller.markAttendance
  )
  .get(
    authorize(PERMISSIONS.ENROLLMENT_READ),
    validate({ params: schema.sessionIdParamSchema, query: schema.listAttendanceSchema }),
    controller.listSessionAttendance
  );

// --- enrolments -------------------------------------------------------------------

router
  .route('/')
  .post(
    authorize(PERMISSIONS.ENROLLMENT_CREATE),
    validate({ body: schema.enrollSchema }),
    controller.enroll
  )
  .get(
    authorize(PERMISSIONS.ENROLLMENT_READ),
    validate({ query: schema.listEnrollmentsSchema }),
    controller.list
  );

router.get(
  '/:id/attendance',
  authorize(PERMISSIONS.ENROLLMENT_READ),
  validate({ params: schema.enrollmentIdParamSchema }),
  controller.attendanceSummary
);

router
  .route('/:id')
  .get(
    authorize(PERMISSIONS.ENROLLMENT_READ),
    validate({ params: schema.enrollmentIdParamSchema }),
    controller.getById
  )
  .patch(
    authorize(PERMISSIONS.ENROLLMENT_UPDATE),
    validate({ params: schema.enrollmentIdParamSchema, body: schema.updateEnrollmentSchema }),
    controller.update
  );

export default router;
