import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/apiResponse.js';
import * as service from './enrollment.service.js';

const ctx = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? '' });

export const enroll = catchAsync(async (req, res) => {
  sendCreated(res, await service.enroll(req.body, req.user, ctx(req)));
});

export const list = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listEnrollments(req.validatedQuery, req.user));
});

export const getById = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getEnrollmentById(req.params.id, req.user));
});

export const update = catchAsync(async (req, res) => {
  sendSuccess(res, await service.updateEnrollment(req.params.id, req.body, req.user, ctx(req)));
});

export const attendanceSummary = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getAttendanceSummary(req.params.id, req.user));
});

/**
 * The whole register in one call. Re-submitting corrects previous marks rather than
 * adding new ones, so a facilitator fixing a mistake does not distort the rate.
 */
export const markAttendance = catchAsync(async (req, res) => {
  sendSuccess(res, await service.markAttendance(req.params.sessionId, req.body.marks, req.user, ctx(req)));
});

export const listSessionAttendance = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listSessionAttendance(req.params.sessionId, req.validatedQuery, req.user));
});
