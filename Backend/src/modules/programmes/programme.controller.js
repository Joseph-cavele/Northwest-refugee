import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/apiResponse.js';
import * as service from './programme.service.js';

const ctx = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? '' });

// --- programmes ------------------------------------------------------------------

export const create = catchAsync(async (req, res) => {
  sendCreated(res, await service.createProgramme(req.body, req.user, ctx(req)));
});

export const list = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listProgrammes(req.validatedQuery, req.user));
});

export const getById = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getProgrammeById(req.params.id, req.user));
});

export const update = catchAsync(async (req, res) => {
  sendSuccess(res, await service.updateProgramme(req.params.id, req.body, req.user, ctx(req)));
});

export const archive = catchAsync(async (req, res) => {
  sendSuccess(res, await service.archiveProgramme(req.params.id, req.user, ctx(req)));
});

// --- cohorts ---------------------------------------------------------------------

export const createCohort = catchAsync(async (req, res) => {
  sendCreated(res, await service.createCohort(req.params.id, req.body, req.user, ctx(req)));
});

export const listCohorts = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listCohorts(req.params.id, req.validatedQuery, req.user));
});

export const getCohort = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getCohortById(req.params.cohortId, req.user));
});

export const updateCohort = catchAsync(async (req, res) => {
  sendSuccess(res, await service.updateCohort(req.params.cohortId, req.body, req.user, ctx(req)));
});

// --- sessions --------------------------------------------------------------------

export const scheduleSession = catchAsync(async (req, res) => {
  sendCreated(res, await service.scheduleSession(req.params.cohortId, req.body, req.user, ctx(req)));
});

export const listSessions = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listSessions(req.params.cohortId, req.validatedQuery, req.user));
});

export const updateSession = catchAsync(async (req, res) => {
  sendSuccess(res, await service.updateSession(req.params.sessionId, req.body, req.user, ctx(req)));
});
