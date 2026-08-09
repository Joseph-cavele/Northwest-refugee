import multer from 'multer';
import AppError from '../utils/AppError.js';

// Memory storage, not disk: an identity document must never be written to the server's
// filesystem, where it would survive the request, land in a backup, and sit outside every
// access control in this codebase. The buffer goes straight to Cloudinary and is dropped.

export const ALLOWED_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic', // what an iPhone produces by default
  'application/pdf',
]);

// 10 MB covers a phone photo of a permit. Enforced by multer before the body is buffered,
// so an oversized upload is rejected without being read into memory.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_REQUEST },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      // The client-declared mimetype is a hint, not proof. It is checked here to reject
      // the obvious cases early; the service re-checks the actual bytes.
      return cb(AppError.badRequest(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

/**
 * Translate multer's own errors into AppError so they leave through errorHandler in the
 * same envelope as everything else. Without this a too-large upload returns multer's raw
 * LIMIT_FILE_SIZE and bypasses the error contract entirely.
 */
function wrap(handler) {
  return function uploadMiddleware(req, res, next) {
    handler(req, res, (err) => {
      if (!err) return next();
      if (err instanceof AppError) return next(err);
      if (err instanceof multer.MulterError) {
        const messages = {
          LIMIT_FILE_SIZE: 'Each file must be 10 MB or smaller',
          LIMIT_FILE_COUNT: `At most ${MAX_FILES_PER_REQUEST} files per upload`,
          LIMIT_UNEXPECTED_FILE: `Unexpected field "${err.field}"`,
        };
        return next(AppError.badRequest(messages[err.code] ?? 'Upload failed'));
      }
      return next(err);
    });
  };
}

export const uploadSingle = (field = 'file') => wrap(upload.single(field));
export const uploadMany = (field = 'files', max = MAX_FILES_PER_REQUEST) =>
  wrap(upload.array(field, max));

export default upload;
