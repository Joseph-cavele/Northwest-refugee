import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/apiResponse.js';
import * as service from './accessRequest.service.js';

const ctx = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? '' });

// --- public ----------------------------------------------------------------------

/**
 * POST /auth/access-requests — submit a request for a staff account.
 *
 * Answers with an acknowledgement, never the created record: returning the row would
 * confirm that one was written, which is exactly what the service works to hide when the
 * address already belongs to a staff member.
 */
export const submit = catchAsync(async (req, res) => {
  sendSuccess(res, await service.submitAccessRequest(req.body, ctx(req)));
});

/** GET /auth/access-requests/options — departments and roles for the public form. */
export const options = catchAsync(async (_req, res) => {
  sendSuccess(res, await service.getAccessRequestOptions());
});

// --- review ----------------------------------------------------------------------

export const list = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listAccessRequests(req.validatedQuery));
});

export const getById = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getAccessRequestById(req.params.id));
});

// 201: approving is what creates the staff account, so this is a creation.
export const approve = catchAsync(async (req, res) => {
  sendCreated(res, await service.approveAccessRequest(req.params.id, req.body, req.user, ctx(req)));
});

export const reject = catchAsync(async (req, res) => {
  sendSuccess(res, await service.rejectAccessRequest(req.params.id, req.body, req.user, ctx(req)));
});
