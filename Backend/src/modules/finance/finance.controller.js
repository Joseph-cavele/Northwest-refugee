import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/apiResponse.js';
import * as service from './finance.service.js';

const ctx = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? '' });

// --- budgets ---------------------------------------------------------------------------

export const createBudget = catchAsync(async (req, res) => {
  sendCreated(res, await service.createBudget(req.body, req.user, ctx(req)));
});

export const listBudgets = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listBudgets(req.validatedQuery));
});

export const getBudget = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getBudgetById(req.params.id));
});

export const updateBudget = catchAsync(async (req, res) => {
  sendSuccess(res, await service.updateBudget(req.params.id, req.body, req.user, ctx(req)));
});

export const submitBudget = catchAsync(async (req, res) => {
  sendSuccess(res, await service.submitBudget(req.params.id, req.user, ctx(req)));
});

export const approveBudget = catchAsync(async (req, res) => {
  sendSuccess(res, await service.approveBudget(req.params.id, req.user, ctx(req)));
});

export const rejectBudget = catchAsync(async (req, res) => {
  sendSuccess(res, await service.rejectBudget(req.params.id, req.body, req.user, ctx(req)));
});

/** Recomputed from posted transactions, so a drifted running figure shows up. */
export const budgetPosition = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getBudgetPosition(req.params.id));
});

// --- transactions ----------------------------------------------------------------------

export const createTransaction = catchAsync(async (req, res) => {
  sendCreated(res, await service.createTransaction(req.body, req.user, ctx(req)));
});

export const listTransactions = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listTransactions(req.validatedQuery));
});

export const getTransaction = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getTransactionById(req.params.id));
});

export const updateTransaction = catchAsync(async (req, res) => {
  sendSuccess(res, await service.updateTransaction(req.params.id, req.body, req.user, ctx(req)));
});

export const submitTransaction = catchAsync(async (req, res) => {
  sendSuccess(res, await service.submitTransaction(req.params.id, req.user, ctx(req)));
});

/** Approving posts the entry. The service refuses a self-approval and enforces the ceiling. */
export const approveTransaction = catchAsync(async (req, res) => {
  sendSuccess(res, await service.approveTransaction(req.params.id, req.user, ctx(req)));
});

export const rejectTransaction = catchAsync(async (req, res) => {
  sendSuccess(res, await service.rejectTransaction(req.params.id, req.body, req.user, ctx(req)));
});

/** Returns both rows — the untouched original and the reversal that corrects it. */
export const reverseTransaction = catchAsync(async (req, res) => {
  sendCreated(res, await service.reverseTransaction(req.params.id, req.body, req.user, ctx(req)));
});

// --- petty cash ------------------------------------------------------------------------

export const createFloat = catchAsync(async (req, res) => {
  sendCreated(res, await service.createFloat(req.body, req.user, ctx(req)));
});

export const listFloats = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listFloats(req.validatedQuery));
});

export const getFloat = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getFloatById(req.params.id));
});

export const recordMovement = catchAsync(async (req, res) => {
  sendCreated(res, await service.recordMovement(req.params.id, req.body, req.user, ctx(req)));
});

export const listMovements = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listMovements(req.params.id, req.validatedQuery));
});

/** Refused for the custodian's own float — see the note in the service. */
export const reconcileFloat = catchAsync(async (req, res) => {
  sendSuccess(res, await service.reconcileFloat(req.params.id, req.body, req.user, ctx(req)));
});
