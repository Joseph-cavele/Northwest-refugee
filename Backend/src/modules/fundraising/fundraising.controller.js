import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/apiResponse.js';
import * as service from './fundraising.service.js';

const ctx = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? '' });

// --- donors ---------------------------------------------------------------------------

export const createDonor = catchAsync(async (req, res) => {
  sendCreated(res, await service.createDonor(req.body, req.user, ctx(req)));
});

export const listDonors = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listDonors(req.validatedQuery, req.user));
});

export const getDonor = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getDonorById(req.params.id));
});

export const updateDonor = catchAsync(async (req, res) => {
  sendSuccess(res, await service.updateDonor(req.params.id, req.body, req.user, ctx(req)));
});

// --- campaigns ------------------------------------------------------------------------

export const createCampaign = catchAsync(async (req, res) => {
  sendCreated(res, await service.createCampaign(req.body, req.user, ctx(req)));
});

export const listCampaigns = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listCampaigns(req.validatedQuery));
});

export const getCampaign = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getCampaignById(req.params.id));
});

export const updateCampaign = catchAsync(async (req, res) => {
  sendSuccess(res, await service.updateCampaign(req.params.id, req.body, req.user, ctx(req)));
});

/** Recomputed from the donations, so a drifted counter shows up rather than being trusted. */
export const campaignTotals = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getCampaignTotals(req.params.id));
});

// --- pledges --------------------------------------------------------------------------

export const createPledge = catchAsync(async (req, res) => {
  sendCreated(res, await service.createPledge(req.body, req.user, ctx(req)));
});

export const listPledges = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listPledges(req.validatedQuery));
});

export const updatePledge = catchAsync(async (req, res) => {
  sendSuccess(res, await service.updatePledge(req.params.id, req.body, req.user, ctx(req)));
});

// --- donations ------------------------------------------------------------------------

export const recordDonation = catchAsync(async (req, res) => {
  sendCreated(res, await service.recordDonation(req.body, req.user, ctx(req)));
});

export const listDonations = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listDonations(req.validatedQuery));
});

export const getDonation = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getDonationById(req.params.id));
});

/**
 * Settling is idempotent — the gateways retry, so this endpoint is expected to be called
 * more than once for the same money and must move the totals only once.
 */
export const settleDonation = catchAsync(async (req, res) => {
  sendSuccess(res, await service.settleDonation(req.params.id, req.body, req.user, ctx(req)));
});

/** For a donor who never received their receipt, or lost it. Keeps the same number. */
export const resendReceipt = catchAsync(async (req, res) => {
  sendSuccess(res, await service.resendReceipt(req.params.id, req.user, ctx(req)));
});

export const refundDonation = catchAsync(async (req, res) => {
  sendSuccess(res, await service.refundDonation(req.params.id, req.body, req.user, ctx(req)));
});
