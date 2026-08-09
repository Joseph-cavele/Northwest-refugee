import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/apiResponse.js';
import * as service from './beneficiary.service.js';

// HTTP shape only. No model imports, no business logic, no query building — every
// decision about who may see what lives in beneficiary.service.js, where it also applies
// to the WhatsApp bot and the cron jobs, which never pass through a controller.

// Request context stamped onto audit rows.
const ctx = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? '' });

export const create = catchAsync(async (req, res) => {
  const beneficiary = await service.createBeneficiary(req.body, req.user, ctx(req));
  sendCreated(res, beneficiary);
});

export const list = catchAsync(async (req, res) => {
  // Express 5's req.query is getter-only, so validate() puts the parsed query here.
  sendPaginated(res, await service.listBeneficiaries(req.validatedQuery, req.user));
});

export const getById = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getBeneficiaryById(req.params.id, req.user));
});

export const update = catchAsync(async (req, res) => {
  sendSuccess(res, await service.updateBeneficiary(req.params.id, req.body, req.user, ctx(req)));
});

/**
 * GET /:id/sensitive — permit number and vulnerability flags. Separate from the ordinary
 * read on purpose: it needs its own permission and writes a SENSITIVE_READ audit entry,
 * so it must be an endpoint a caller chooses deliberately, not a field on the main GET.
 */
export const getSensitive = catchAsync(async (req, res) => {
  const reason = req.validatedQuery?.reason;
  sendSuccess(res, await service.readSensitive(req.params.id, req.user, ctx(req), reason));
});

/**
 * POST, not GET. The permit number is the payload, and a GET would put it in the URL —
 * where it lands in access logs, browser history and any proxy in between.
 */
export const lookupByPermit = catchAsync(async (req, res) => {
  sendSuccess(res, await service.findByPermitNumber(req.body.permitNumber, req.user, ctx(req)));
});

/**
 * GET /permits/expiring — the caseworker's queue.
 *
 * Deliberately routed through listBeneficiaries, NOT service.findExpiringPermits: that
 * function is unscoped for the cron job's benefit, and exposing it over HTTP would hand a
 * volunteer the whole register.
 */
export const expiringPermits = catchAsync(async (req, res) => {
  const query = { ...req.validatedQuery };
  if (query.permitExpiringWithinDays === undefined) query.permitExpiringWithinDays = 30;
  sendPaginated(res, await service.listBeneficiaries(query, req.user));
});

export const verify = catchAsync(async (req, res) => {
  sendSuccess(res, await service.verifyBeneficiary(req.params.id, req.body, req.user, ctx(req)));
});

export const assign = catchAsync(async (req, res) => {
  const { assignedOfficer } = req.body;
  sendSuccess(res, await service.assignOfficer(req.params.id, assignedOfficer, req.user, ctx(req)));
});

export const exit = catchAsync(async (req, res) => {
  sendSuccess(res, await service.exitBeneficiary(req.params.id, req.body, req.user, ctx(req)));
});

export const withdrawConsent = catchAsync(async (req, res) => {
  sendSuccess(res, await service.withdrawConsent(req.params.id, req.body, req.user, ctx(req)));
});

/**
 * Soft delete. Returns the record rather than 204 so the client can see deletedAt — the
 * row still exists, and a UI that treated this as a hard delete would misrepresent it.
 */
export const remove = catchAsync(async (req, res) => {
  sendSuccess(res, await service.softDeleteBeneficiary(req.params.id, req.user, ctx(req)));
});
