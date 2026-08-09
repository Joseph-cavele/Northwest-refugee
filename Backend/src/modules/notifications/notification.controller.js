import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendPaginated } from '../../utils/apiResponse.js';
import * as service from './notification.service.js';

// Every handler here reads req.user and nothing else identifying — a caller cannot ask for
// someone else's notifications, because no route accepts a user id.

export const list = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listNotifications(req.validatedQuery, req.user));
});

export const unreadCount = catchAsync(async (req, res) => {
  sendSuccess(res, await service.unreadCount(req.user));
});

export const markRead = catchAsync(async (req, res) => {
  sendSuccess(res, await service.markRead(req.params.id, req.user));
});

export const markAllRead = catchAsync(async (req, res) => {
  sendSuccess(res, await service.markAllRead(req.user));
});
