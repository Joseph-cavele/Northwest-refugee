import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendPaginated } from '../../utils/apiResponse.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { PAGINATION } from '../../config/constants.js';
import { ACTIONS } from './audit.model.js';
import * as service from './audit.service.js';

// Read-only by construction: AuditLog blocks every update and delete at the model layer,
// so there is deliberately no write route here and no controller file — the module is two
// handlers thin.
//
// The trail is NOT scoped to a caseload. It answers "who accessed whose record", which is
// only useful if it covers everyone; that is why audit:read is held by three office roles
// (Executive Director, Admin Officer, M&E Officer) and nobody in the field.
//
// Reads of the audit log are deliberately not themselves audited. One entry per page view
// would bury the events an auditor is actually looking for, and access to this route is
// already constrained by the permission.

const objectId = (label) =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

const listAuditSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
    actor: objectId('actor id').optional(),
    // Constrained to the known vocabulary: a typo'd action would otherwise return an
    // empty page that reads as "nothing happened".
    action: z.enum(Object.values(ACTIONS), { error: 'Unknown audit action' }).optional(),
    targetType: z.string().trim().max(40).optional(),
    targetId: z.string().trim().max(64).optional(),
    status: z.enum(['success', 'failure']).optional(),
    from: z.iso.datetime({ error: 'from must be an ISO date-time' }).transform((v) => new Date(v)).optional(),
    to: z.iso.datetime({ error: 'to must be an ISO date-time' }).transform((v) => new Date(v)).optional(),
    sort: z.enum(['createdAt', '-createdAt']).default('-createdAt'),
  })
  .superRefine((data, ctx) => {
    if (data.from && data.to && data.to < data.from) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'End of range must be after the start' });
    }
  });

const router = Router();

router.use(authenticate);

// Static before any parameterised path.
router.get(
  '/actions',
  authorize(PERMISSIONS.AUDIT_READ),
  catchAsync(async (_req, res) => {
    sendSuccess(res, service.listActions());
  })
);

router.get(
  '/',
  authorize(PERMISSIONS.AUDIT_READ),
  validate({ query: listAuditSchema }),
  catchAsync(async (req, res) => {
    sendPaginated(res, await service.listAuditEntries(req.validatedQuery));
  })
);

export default router;
