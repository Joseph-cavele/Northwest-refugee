import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/apiResponse.js';
import * as service from './chatboard.service.js';

// HTTP shape only — no model imports and no visibility logic. Whether a private channel
// is readable is decided in the service, so the same rule applies to any future caller
// that does not arrive over HTTP.

// --- channels --------------------------------------------------------------------

export const createChannel = catchAsync(async (req, res) => {
  sendCreated(res, await service.createChannel(req.body, req.user));
});

export const listChannels = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listChannels(req.validatedQuery, req.user));
});

export const getChannel = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getChannel(req.params.id, req.user));
});

export const updateChannel = catchAsync(async (req, res) => {
  sendSuccess(res, await service.updateChannel(req.params.id, req.body, req.user));
});

export const archiveChannel = catchAsync(async (req, res) => {
  sendSuccess(res, await service.archiveChannel(req.params.id, req.user));
});

// --- messages --------------------------------------------------------------------

export const postMessage = catchAsync(async (req, res) => {
  sendCreated(res, await service.postMessage(req.params.id, req.body, req.user));
});

export const listMessages = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listMessages(req.params.id, req.validatedQuery, req.user));
});

export const editMessage = catchAsync(async (req, res) => {
  sendSuccess(res, await service.editMessage(req.params.id, req.body.body, req.user));
});

export const deleteMessage = catchAsync(async (req, res) => {
  sendSuccess(res, await service.deleteMessage(req.params.id, req.user));
});
