import { v2 as cloudinary } from 'cloudinary';
import env from './env.js';
import logger from './logger.js';

// Beneficiary documents are permit scans and birth certificates belonging to refugees and
// children. They are uploaded as `type: 'private'` and are never publicly addressable.
//
// WHY private_download_url AND NOT cloudinary.url():
// cloudinary.url(id, { sign_url: true, expires_at }) silently IGNORES expires_at — it
// returns a signed URL with no expiry component, which works forever once leaked. Only
// utils.private_download_url() puts expires_at into the URL and signs over it. Verified
// against cloudinary 2.10.0; re-check if that dependency is upgraded.

const CONFIGURED = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
);

if (CONFIGURED) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
} else {
  logger.warn('Cloudinary is not configured — document upload and download will refuse');
}

// Five minutes: long enough to click through from a case file, short enough that a URL
// pasted into a chat or left in browser history is dead by the time anyone else sees it.
export const DOWNLOAD_URL_TTL_SECONDS = 300;

// Everything lands under one prefix so a Cloudinary-side retention or access rule can be
// applied to the whole set.
const FOLDER = 'nwhr/beneficiary-documents';

function assertConfigured() {
  if (!CONFIGURED) {
    // Fail closed. Never fall back to an unsigned or public delivery path.
    throw new Error(
      'Cloudinary is not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET'
    );
  }
}

export function isCloudinaryConfigured() {
  return CONFIGURED;
}

/**
 * Upload a buffer as a private asset.
 *
 * `access_mode: 'authenticated'` plus `type: 'private'` is what keeps the asset off the
 * public CDN — an upload without both is world-readable to anyone who guesses the URL.
 */
export function uploadBuffer(buffer, { filename, folder = FOLDER, resourceType = 'auto' } = {}) {
  assertConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        type: 'private',
        access_mode: 'authenticated',
        resource_type: resourceType,
        // Cloudinary would otherwise derive a public_id from the filename, putting a
        // beneficiary's name into a URL.
        use_filename: false,
        unique_filename: true,
        overwrite: false,
        context: filename ? { original_filename: filename } : undefined,
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

/**
 * A signed, expiring download URL. Generate one per request and never persist it — a
 * stored URL outlives the permission check that produced it.
 */
export function signedDownloadUrl(publicId, format, { resourceType = 'image', ttlSeconds = DOWNLOAD_URL_TTL_SECONDS } = {}) {
  assertConfigured();

  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: resourceType,
    type: 'private',
    expires_at: expiresAt,
    attachment: true,
  });
}

/**
 * Permanently destroy an asset. Used by the retention/purge path only — an ordinary
 * delete soft-deletes the database row and leaves the file, because a case history that
 * loses its evidence cannot be audited.
 */
export function destroyAsset(publicId, { resourceType = 'image' } = {}) {
  assertConfigured();
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'private' });
}

export default cloudinary;
