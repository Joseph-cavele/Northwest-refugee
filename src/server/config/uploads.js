// What an upload is allowed to be.
//
// These were multer's options under Express. Next Route Handlers parse multipart through
// the platform's own FormData, so there is no multer and no middleware — but the limits
// are policy, not plumbing, and document.schema.js has always imported them. They live in
// config/ now so the schema and the handler read the same numbers.

export const ALLOWED_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic', // what an iPhone produces by default
  'application/pdf',
]);

// 10 MB covers a phone photo of a permit.
//
// CHANGED IN MEANING BY THE PORT — read this before raising it. multer enforced the limit
// while streaming, so an oversized upload was refused without ever being buffered. A Route
// Handler's `request.formData()` resolves only after the whole body is in memory, so the
// check below happens *after* the bytes have arrived. The ceiling is therefore also a
// memory budget per concurrent upload, and on a serverless runtime it is charged against
// the function's limit. Enforce it as early as possible — Content-Length first, then the
// per-file size — which is what readUpload() in server/http/upload.js does.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 5;

/**
 * An identity document must never be written to disk.
 *
 * Under Express this was `multer.memoryStorage()`, chosen so a permit scan could not
 * survive the request, land in a backup, and sit outside every access control in this
 * codebase. Nothing in the Next port writes to the filesystem either — the bytes go from
 * FormData straight to Cloudinary and are dropped. Kept as a named constant so the reason
 * is discoverable from the schema that imports these.
 */
export const STORAGE = 'memory';
