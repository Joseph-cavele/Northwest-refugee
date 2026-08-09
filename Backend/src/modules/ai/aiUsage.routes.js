import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as controller from './aiUsage.controller.js';
import * as schema from './aiUsage.schema.js';

const router = Router();

router.use(authenticate);

// Guarded by budget:read — this is a spend figure, so the people who may see budgets are
// exactly the people who may see it.
router.get(
  '/spend',
  authorize(PERMISSIONS.BUDGET_READ),
  validate({ query: schema.spendQuerySchema }),
  controller.spend
);

export default router;
