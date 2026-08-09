import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/apiResponse.js';
import * as service from './serviceRequest.service.js';

const ctx = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? '' });

export const create = catchAsync(async (req, res) => {
  sendCreated(res, await service.createServiceRequest(req.body, req.user, ctx(req)));
});

export const list = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listServiceRequests(req.validatedQuery, req.user));
});

export const getById = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getServiceRequestById(req.params.id, req.user));
});

export const update = catchAsync(async (req, res) => {
  sendSuccess(res, await service.updateServiceRequest(req.params.id, req.body, req.user, ctx(req)));
});

export const assign = catchAsync(async (req, res) => {
  const { assignedTo } = req.body;
  sendSuccess(res, await service.assignServiceRequest(req.params.id, assignedTo, req.user, ctx(req)));
});

/**
 * Status changes have their own endpoint rather than being a field on PATCH, so an
 * invalid jump — resolving an already-resolved request — is refused with a 409 that says
 * which transitions are available, instead of being written silently.
 */
export const transition = catchAsync(async (req, res) => {
  sendSuccess(res, await service.transitionServiceRequest(req.params.id, req.body, req.user, ctx(req)));
});
