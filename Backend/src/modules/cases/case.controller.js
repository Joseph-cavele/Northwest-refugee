import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/apiResponse.js';
import * as service from './case.service.js';

const ctx = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? '' });

export const open = catchAsync(async (req, res) => {
  sendCreated(res, await service.openCase(req.body, req.user, ctx(req)));
});

export const list = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listCases(req.validatedQuery, req.user));
});

/**
 * GET /urgent — HIGH or URGENT and still open, oldest first.
 *
 * A thin alias over the same scoped list rather than a separate query, so the supervisor's
 * queue can never show a case the caller would not be allowed to open.
 */
export const urgent = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listCases({ ...req.validatedQuery, urgent: true }, req.user));
});

export const getById = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getCaseById(req.params.id, req.user));
});

export const update = catchAsync(async (req, res) => {
  sendSuccess(res, await service.updateCase(req.params.id, req.body, req.user, ctx(req)));
});

export const assign = catchAsync(async (req, res) => {
  sendSuccess(res, await service.assignCase(req.params.id, req.body.caseworker, req.user, ctx(req)));
});

export const setStatus = catchAsync(async (req, res) => {
  sendSuccess(res, await service.setCaseStatus(req.params.id, req.body, req.user, ctx(req)));
});

export const close = catchAsync(async (req, res) => {
  sendSuccess(res, await service.closeCase(req.params.id, req.body, req.user, ctx(req)));
});
