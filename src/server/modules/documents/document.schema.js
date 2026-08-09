import { z } from 'zod';
import { PAGINATION } from '../../config/constants.js';
import { DOCUMENT_KINDS } from './document.model.js';
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } from '../../config/uploads.js';

// The file itself arrives as multipart, which zod cannot see on req.body — multer handles
// size and type, and the service re-checks the actual bytes. These schemas cover the
// fields that travel alongside it.

const objectId = (label = 'id') =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

export const uploadDocumentSchema = z.object({
  beneficiary: objectId('beneficiary id'),
  kind: z.enum(DOCUMENT_KINDS, { error: 'Select a valid document type' }).default('OTHER'),
});

/**
 * Shape of a multer file, validated in the service before anything is sent to Cloudinary.
 * multer has already applied both limits; this catches a misconfigured route that forgot
 * to use the upload middleware at all.
 */
export const uploadedFileSchema = z.object({
  originalname: z.string({ error: 'File name is missing' }).trim().min(1).max(255),
  mimetype: z.enum(ALLOWED_MIME_TYPES, { error: 'Only JPG, PNG, WEBP, HEIC or PDF files are accepted' }),
  size: z.number({ error: 'File size is missing' }).int().positive('File is empty').max(MAX_FILE_BYTES, 'Each file must be 10 MB or smaller'),
  buffer: z.instanceof(Buffer, { error: 'File contents are missing' }),
});

export const listDocumentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  // Required, not optional. A document is always viewed inside a case file, and asking
  // for one beneficiary at a time is what lets access be checked exactly — via the
  // beneficiary service — instead of approximated with a join this layer cannot scope.
  beneficiary: objectId('beneficiary id'),
  kind: z.enum(DOCUMENT_KINDS).optional(),
  sort: z.enum(['createdAt', '-createdAt']).default('-createdAt'),
  includeDeleted: z.coerce.boolean().default(false),
});

export const documentIdParamSchema = z.object({ id: objectId('document id') });

/**
 * Why the caller is fetching the file. Optional, but it is written into the
 * DOCUMENT_DOWNLOADED audit entry — an access review is far more useful when the trail
 * says "Home Affairs renewal" than when it only records that someone looked.
 */
export const downloadQuerySchema = z.object({
  reason: z.string().trim().max(200).optional(),
});
