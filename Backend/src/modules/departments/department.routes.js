import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as controller from './department.controller.js';
import * as schema from './department.schema.js';

const router = Router();

// Every route here is authenticated. The one place departments are needed without a login
// is the public staff access-request form, which is served a narrower list by
// GET /api/v1/auth/access-requests/options — see modules/auth/accessRequest.controller.js.
router.use(authenticate);

router
  .route('/')
  .post(
    authorize(PERMISSIONS.DEPARTMENT_CREATE),
    validate({ body: schema.createDepartmentSchema }),
    controller.create
  )
  .get(
    authorize(PERMISSIONS.DEPARTMENT_READ),
    validate({ query: schema.listDepartmentsSchema }),
    controller.list
  );

router
  .route('/:id')
  .get(
    authorize(PERMISSIONS.DEPARTMENT_READ),
    validate({ params: schema.departmentIdParamSchema }),
    controller.getById
  )
  .patch(
    authorize(PERMISSIONS.DEPARTMENT_UPDATE),
    validate({ params: schema.departmentIdParamSchema, body: schema.updateDepartmentSchema }),
    controller.update
  );

export default router;
