import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as controller from './referral.controller.js';
import * as schema from './referral.schema.js';

const router = Router();

router.use(authenticate);

router
  .route('/')
  .post(
    authorize(PERMISSIONS.REFERRAL_CREATE),
    validate({ body: schema.createReferralSchema }),
    controller.create
  )
  .get(
    authorize(PERMISSIONS.REFERRAL_READ),
    validate({ query: schema.listReferralsSchema }),
    controller.list
  );

router
  .route('/:id')
  .get(
    authorize(PERMISSIONS.REFERRAL_READ),
    validate({ params: schema.referralIdParamSchema }),
    controller.getById
  )
  .patch(
    authorize(PERMISSIONS.REFERRAL_UPDATE),
    validate({ params: schema.referralIdParamSchema, body: schema.updateReferralSchema }),
    controller.update
  );

// Separate from PATCH so an invalid transition is refused rather than written.
router.post(
  '/:id/status',
  authorize(PERMISSIONS.REFERRAL_UPDATE),
  validate({ params: schema.referralIdParamSchema, body: schema.transitionReferralSchema }),
  controller.transition
);

export default router;
