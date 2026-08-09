import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/apiResponse.js';
import * as service from './department.service.js';

const ctx = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? '' });

export const create = catchAsync(async (req, res) => {
  sendCreated(res, await service.createDepartment(req.body, req.user, ctx(req)));
});

export const list = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listDepartments(req.validatedQuery));
});

export const getById = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getDepartmentById(req.params.id));
});

export const update = catchAsync(async (req, res) => {
  sendSuccess(res, await service.updateDepartment(req.params.id, req.body, req.user, ctx(req)));
});
