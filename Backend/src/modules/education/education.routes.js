import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/apiResponse.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as service from './education.service.js';
import * as schema from './education.schema.js';

// Thin handlers only: validation is in education.schema.js and the logic is in
// education.service.js. Nothing here reaches a model.

const ctx = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? '' });

// --- routes -----------------------------------------------------------------------

const router = Router();
router.use(authenticate);

router
  .route('/placements')
  .post(
    authorize(PERMISSIONS.EDUCATION_CREATE),
    validate({ body: schema.createPlacementSchema }),
    catchAsync(async (req, res) => sendCreated(res, await service.createPlacement(req.body, req.user, ctx(req))))
  )
  .get(
    authorize(PERMISSIONS.EDUCATION_READ),
    validate({ query: schema.listPlacementsSchema }),
    catchAsync(async (req, res) => sendPaginated(res, await service.listPlacements(req.validatedQuery, req.user)))
  );

router
  .route('/placements/:id')
  .get(
    authorize(PERMISSIONS.EDUCATION_READ),
    validate({ params: schema.idParam }),
    catchAsync(async (req, res) => sendSuccess(res, await service.getPlacementById(req.params.id, req.user)))
  )
  .patch(
    authorize(PERMISSIONS.EDUCATION_UPDATE),
    validate({ params: schema.idParam, body: schema.updatePlacementSchema }),
    catchAsync(async (req, res) =>
      sendSuccess(res, await service.updatePlacement(req.params.id, req.body, req.user, ctx(req))))
  );

router
  .route('/cooperatives')
  .post(
    authorize(PERMISSIONS.EDUCATION_CREATE),
    validate({ body: schema.createCooperativeSchema }),
    catchAsync(async (req, res) => sendCreated(res, await service.createCooperative(req.body, req.user, ctx(req))))
  )
  .get(
    authorize(PERMISSIONS.EDUCATION_READ),
    validate({ query: schema.listCooperativesSchema }),
    catchAsync(async (req, res) => sendPaginated(res, await service.listCooperatives(req.validatedQuery, req.user)))
  );

// Membership before /cooperatives/:id so neither path shadows the other.
router.post(
  '/cooperatives/:id/members',
  authorize(PERMISSIONS.EDUCATION_UPDATE),
  validate({ params: schema.idParam, body: schema.memberSchema }),
  catchAsync(async (req, res) => sendSuccess(res, await service.addMember(req.params.id, req.body, req.user, ctx(req))))
);

router.delete(
  '/cooperatives/:id/members/:beneficiaryId',
  authorize(PERMISSIONS.EDUCATION_UPDATE),
  validate({ params: schema.memberParam }),
  catchAsync(async (req, res) =>
    sendSuccess(res, await service.removeMember(req.params.id, req.params.beneficiaryId, req.user, ctx(req))))
);

router
  .route('/cooperatives/:id')
  .get(
    authorize(PERMISSIONS.EDUCATION_READ),
    validate({ params: schema.idParam }),
    catchAsync(async (req, res) => sendSuccess(res, await service.getCooperativeById(req.params.id, req.user)))
  )
  .patch(
    authorize(PERMISSIONS.EDUCATION_UPDATE),
    validate({ params: schema.idParam, body: schema.updateCooperativeSchema }),
    catchAsync(async (req, res) =>
      sendSuccess(res, await service.updateCooperative(req.params.id, req.body, req.user, ctx(req))))
  );

export default router;
