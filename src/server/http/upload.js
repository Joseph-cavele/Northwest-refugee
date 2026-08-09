import AppError from '../utils/AppError.js';
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } from '../config/uploads.js';

/*
 * multipart/form-data, without multer.
 *
 * multer is Express middleware and cannot come across, so a Route Handler reads the
 * platform's own FormData instead. document.service.js is unchanged and still expects
 * multer's file shape — `{ originalname, mimetype, size, buffer }` — so that is exactly
 * what this returns. Adapting here rather than editing the service keeps the byte-level
 * re-checks (magic numbers, real size) where they already are.
 *
 * WHAT GOT WORSE, HONESTLY. multer enforced the size limit while streaming, so an
 * oversized upload was refused without ever being buffered. `request.formData()` resolves
 * only once the whole body is in memory. The Content-Length check below is the earliest
 * refusal available and is why it comes first — but a client that lies about (or omits)
 * Content-Length still gets its bytes buffered before the second check catches it. On a
 * serverless runtime that memory is charged against the function's limit, so the ceiling
 * in config/uploads.js is now a concurrency budget as well as a policy.
 */

/**
 * Read one file plus its accompanying fields.
 *
 * @param {Request} request
 * @param {object} [options]
 * @param {string} [options.field='file'] the multipart field holding the upload
 * @returns {Promise<{ file: object, fields: Record<string, string> }>}
 */
export async function readUpload(request, { field = 'file' } = {}) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    throw AppError.badRequest('Expected a multipart/form-data upload');
  }

  // Cheapest possible rejection: refuse on the declared length before reading anything.
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_FILE_BYTES) {
    throw AppError.badRequest('Each file must be 10 MB or smaller');
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    throw AppError.badRequest('Could not read the uploaded file');
  }

  const entry = form.get(field);
  if (!entry || typeof entry === 'string') {
    throw AppError.validationFailed({ [field]: 'No file was uploaded' }, 'No valid file was uploaded');
  }

  if (entry.size > MAX_FILE_BYTES) {
    throw AppError.badRequest('Each file must be 10 MB or smaller');
  }

  /*
   * The client-declared type is a hint, not proof — it is checked here to reject the
   * obvious cases early, and document.service.js re-checks the actual bytes. Both layers
   * are wanted: this one keeps junk out of memory, that one is the truth.
   */
  if (!ALLOWED_MIME_TYPES.includes(entry.type)) {
    throw AppError.badRequest(`Unsupported file type: ${entry.type || 'unknown'}`);
  }

  const buffer = Buffer.from(await entry.arrayBuffer());

  // Everything that is not the file, so the caller can validate it with the same zod
  // schema the JSON routes use.
  const fields = {};
  for (const [key, value] of form.entries()) {
    if (key === field) continue;
    if (typeof value === 'string') fields[key] = value;
  }

  return {
    // multer's shape, so the service needs no changes.
    file: {
      originalname: entry.name,
      mimetype: entry.type,
      size: entry.size,
      buffer,
    },
    fields,
  };
}

export default readUpload;
