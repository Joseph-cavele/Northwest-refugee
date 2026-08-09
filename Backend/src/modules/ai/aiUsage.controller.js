import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as service from './aiUsage.service.js';

// Read-only by design. There is no route that adjusts the ceiling: the budget is an
// operating decision that belongs in configuration, reviewed with the rest of it, not a
// number anyone can raise from a dashboard at the moment it becomes inconvenient.

export const spend = catchAsync(async (req, res) => {
  const { period } = req.validatedQuery ?? {};
  sendSuccess(res, await service.getSpend(period ?? service.currentPeriod()));
});
