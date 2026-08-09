import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/apiResponse.js';
import * as service from './document.service.js';

const ctx = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? '' });

/**
 * The file arrives on req.file from multer; the accompanying fields are on req.body,
 * already validated. The buffer is handed straight to the service and never written to
 * disk.
 */
export const upload = catchAsync(async (req, res) => {
  const doc = await service.uploadDocument(req.body, req.file, req.user, ctx(req));
  sendCreated(res, doc);
});

export const list = catchAsync(async (req, res) => {
  sendPaginated(res, await service.listDocuments(req.validatedQuery, req.user));
});

export const getById = catchAsync(async (req, res) => {
  sendSuccess(res, await service.getDocumentById(req.params.id, req.user));
});

/**
 * Returns a signed URL rather than proxying the bytes. The URL expires in minutes and is
 * generated per request, so it cannot outlive the permission check behind it — and every
 * call writes a DOCUMENT_DOWNLOADED entry naming the actor.
 */
export const download = catchAsync(async (req, res) => {
  const reason = req.validatedQuery?.reason;
  sendSuccess(res, await service.getDownloadUrl(req.params.id, req.user, ctx(req), reason));
});

export const remove = catchAsync(async (req, res) => {
  sendSuccess(res, await service.deleteDocument(req.params.id, req.user, ctx(req)));
});
