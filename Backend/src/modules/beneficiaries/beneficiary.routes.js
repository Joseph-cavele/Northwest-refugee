import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as controller from './beneficiary.controller.js';
import * as schema from './beneficiary.schema.js';

const router = Router();

// Nothing in this module is public — the register is the most sensitive collection in the
// system. authenticate runs once here rather than being repeated on every line, where a
// single omission would expose a route.
router.use(authenticate);

// Every guard names a permission, never a role. Row-level scoping is applied separately
// inside the service: this layer only answers "may this role call this endpoint at all".

// --- static paths first -----------------------------------------------------------
// Express matches in declaration order, so anything below /:id would otherwise be
// swallowed — '/permits/expiring' would arrive as id='permits'.

router.get(
  '/permits/expiring',
  authorize(PERMISSIONS.BENEFICIARY_READ),
  validate({ query: schema.listBeneficiariesSchema }),
  controller.expiringPermits
);

// POST so the permit number stays out of the URL, access logs and browser history.
router.post(
  '/permits/lookup',
  authorize(PERMISSIONS.BENEFICIARY_READ_SENSITIVE),
  validate({ body: schema.permitLookupSchema }),
  controller.lookupByPermit
);

// --- collection -------------------------------------------------------------------

router
  .route('/')
  .post(
    authorize(PERMISSIONS.BENEFICIARY_CREATE),
    validate({ body: schema.createBeneficiarySchema }),
    controller.create
  )
  .get(
    authorize(PERMISSIONS.BENEFICIARY_READ),
    validate({ query: schema.listBeneficiariesSchema }),
    controller.list
  );

// --- single record ----------------------------------------------------------------

router
  .route('/:id')
  .get(
    authorize(PERMISSIONS.BENEFICIARY_READ),
    validate({ params: schema.beneficiaryIdParamSchema }),
    controller.getById
  )
  .patch(
    authorize(PERMISSIONS.BENEFICIARY_UPDATE),
    validate({ params: schema.beneficiaryIdParamSchema, body: schema.updateBeneficiarySchema }),
    controller.update
  )
  .delete(
    authorize(PERMISSIONS.BENEFICIARY_DELETE),
    validate({ params: schema.beneficiaryIdParamSchema }),
    controller.remove
  );

// Its own permission and its own audit entry — see the note in the controller.
router.get(
  '/:id/sensitive',
  authorize(PERMISSIONS.BENEFICIARY_READ_SENSITIVE),
  validate({ params: schema.beneficiaryIdParamSchema, query: schema.sensitiveReadQuerySchema }),
  controller.getSensitive
);

router.post(
  '/:id/verify',
  authorize(PERMISSIONS.BENEFICIARY_VERIFY),
  validate({ params: schema.beneficiaryIdParamSchema, body: schema.verifyBeneficiarySchema }),
  controller.verify
);

router.post(
  '/:id/assign',
  authorize(PERMISSIONS.BENEFICIARY_UPDATE),
  validate({ params: schema.beneficiaryIdParamSchema, body: schema.assignOfficerSchema }),
  controller.assign
);

router.post(
  '/:id/exit',
  authorize(PERMISSIONS.BENEFICIARY_UPDATE),
  validate({ params: schema.beneficiaryIdParamSchema, body: schema.exitBeneficiarySchema }),
  controller.exit
);

// Withdrawal stops further processing; it does not delete. See the service for why.
router.post(
  '/:id/consent/withdraw',
  authorize(PERMISSIONS.BENEFICIARY_UPDATE),
  validate({ params: schema.beneficiaryIdParamSchema, body: schema.withdrawConsentSchema }),
  controller.withdrawConsent
);

export default router;
