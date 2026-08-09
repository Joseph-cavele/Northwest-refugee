import crypto from 'node:crypto';
import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import {
  uploadBuffer,
  signedDownloadUrl,
  destroyAsset,
  DOWNLOAD_URL_TTL_SECONDS,
} from '../../config/cloudinary.js';
import logger from '../../config/logger.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
// Cross-module access is service → service. Going straight to the Beneficiary model here
// would skip its row-level scoping and hand a volunteer every case file's documents.
import { getBeneficiaryById, setPermitDocument } from '../beneficiaries/beneficiary.service.js';
import Document from './document.model.js';
import { uploadedFileSchema } from './document.schema.js';

// Uploading one of these is what makes a permit scan *the* permit scan on the case file —
// `immigration.documentId` is pointed at it so a caseworker opening the record finds the
// evidence without hunting through every attachment.
const PERMIT_KINDS = new Set(['ASYLUM_PERMIT', 'REFUGEE_ID']);

// --- content sniffing -------------------------------------------------------------
// The declared mimetype is client-supplied and trivially forged. multer filters on it for
// an early rejection; this checks the actual leading bytes before anything is stored, so
// an executable renamed to .jpg does not end up in the document store.

const SIGNATURES = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  },
  { mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString() === '%PDF-' },
  {
    // HEIC/HEIF from an iPhone: an ISO-BMFF box whose brand starts at byte 4.
    mime: 'image/heic',
    test: (b) => b.subarray(4, 8).toString() === 'ftyp' && /heic|heix|mif1|msf1|hevc/.test(b.subarray(8, 12).toString()),
  },
];

function sniffMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  return SIGNATURES.find((s) => s.test(buffer))?.mime ?? null;
}

function formatFor(mimeType) {
  return {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'application/pdf': 'pdf',
  }[mimeType] ?? null;
}

/**
 * Load a document the actor is allowed to see. Access is inherited from the beneficiary:
 * getBeneficiaryById applies the row-level scoping and throws 404 when out of scope, so a
 * volunteer cannot reach another caseworker's documents by guessing an id.
 */
async function findScopedOrFail(id, actor, { includeDeleted = false } = {}) {
  const filter = { _id: id };
  if (!includeDeleted) filter.deletedAt = null;

  const doc = await Document.findOne(filter).exec();
  if (!doc) throw AppError.notFound('Document');

  // Throws 404 if the beneficiary is outside the actor's scope.
  await getBeneficiaryById(doc.beneficiary, actor);
  return doc;
}

// --- upload -----------------------------------------------------------------------

/**
 * Store a file against a beneficiary. The buffer goes straight from memory to Cloudinary
 * as a private asset — it is never written to disk, and no URL is persisted.
 */
export async function uploadDocument({ beneficiary: beneficiaryId, kind }, file, actor, ctx = {}) {
  // Access first: refuse before a single byte is sent to a third party.
  const beneficiary = await getBeneficiaryById(beneficiaryId, actor);

  const parsed = uploadedFileSchema.safeParse(file ?? {});
  if (!parsed.success) {
    const details = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join('.') || 'file', i.message])
    );
    throw AppError.validationFailed(details, 'No valid file was uploaded');
  }
  const { originalname, mimetype, size, buffer } = parsed.data;

  const sniffed = sniffMimeType(buffer);
  if (!sniffed) throw AppError.badRequest('File contents are not a recognised image or PDF');
  if (sniffed !== mimetype) {
    // A mismatch is not necessarily an attack — browsers mislabel HEIC routinely — but the
    // bytes win, and a deliberate mislabel stops here.
    throw AppError.badRequest(`File contents (${sniffed}) do not match the declared type (${mimetype})`);
  }

  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const existing = await Document.findOne({ beneficiary: beneficiary._id, checksum, deletedAt: null });
  if (existing) {
    throw AppError.conflict('That file has already been uploaded for this beneficiary');
  }

  // resource_type: 'auto' lets Cloudinary classify it; whatever it decides is stored, so
  // the download URL is later signed with the same resource type it was uploaded under.
  const uploaded = await uploadBuffer(buffer, { filename: originalname, resourceType: 'auto' });

  let doc;
  try {
    doc = await Document.create({
      beneficiary: beneficiary._id,
      kind,
      storageKey: uploaded.public_id,
      resourceType: uploaded.resource_type ?? 'image',
      format: uploaded.format ?? formatFor(sniffed),
      originalName: originalname,
      mimeType: sniffed,
      bytes: uploaded.bytes ?? size,
      checksum,
      uploadedBy: actor._id,
    });
  } catch (err) {
    // The asset is already in Cloudinary but has no row pointing at it. Leaving it there
    // would be an unreferenced copy of someone's identity document, so it is removed
    // before the error propagates.
    await destroyAsset(uploaded.public_id, { resourceType: uploaded.resource_type }).catch((cleanupErr) =>
      logger.error({ err: cleanupErr, publicId: uploaded.public_id }, 'orphaned Cloudinary asset — manual cleanup needed')
    );
    if (err?.code === 11000) throw AppError.conflict('That file has already been uploaded for this beneficiary');
    throw err;
  }

  await audit.record({
    actor,
    action: ACTIONS.DOCUMENT_UPLOADED,
    targetType: 'Document',
    targetId: doc._id,
    ctx,
    // References only — never the file name, which frequently contains a person's name.
    meta: { beneficiary: String(beneficiary._id), kind, mimeType: sniffed, bytes: doc.bytes },
  });

  // Best-effort: the document is already stored and audited, so a failure to link must
  // not fail the upload and leave the caller thinking nothing was saved.
  if (PERMIT_KINDS.has(kind)) {
    await setPermitDocument(beneficiary._id, doc._id, actor, ctx).catch((err) =>
      logger.error({ err, document: String(doc._id) }, 'failed to link permit document to beneficiary')
    );
  }

  return doc;
}

// --- read -------------------------------------------------------------------------

export async function listDocuments(query, actor) {
  const { page, limit, sort, beneficiary: beneficiaryId, kind, includeDeleted } = query;

  // Scoping is enforced here: if the actor cannot see the beneficiary, this throws 404
  // before any document is read.
  const beneficiary = await getBeneficiaryById(beneficiaryId, actor);

  const filter = { beneficiary: beneficiary._id };
  if (kind) filter.kind = kind;
  if (!includeDeleted) filter.deletedAt = null;

  return paginateQuery(Document, filter, { page, limit, sort });
}

export async function getDocumentById(id, actor) {
  return findScopedOrFail(id, actor);
}

/**
 * Mint a signed, expiring download URL and record who fetched it.
 *
 * The audit entry is written BEFORE the URL is returned: if auditing and issuing can't
 * both happen, the safe failure is "no access", not "untraceable access". (AuditLog.record
 * is best-effort by design, so this is about ordering, not a guarantee.)
 */
export async function getDownloadUrl(id, actor, ctx = {}, reason) {
  const doc = await findScopedOrFail(id, actor);

  await audit.record({
    actor,
    action: ACTIONS.DOCUMENT_DOWNLOADED,
    targetType: 'Document',
    targetId: doc._id,
    ctx,
    meta: {
      beneficiary: String(doc.beneficiary),
      kind: doc.kind,
      ...(reason ? { reason } : {}),
    },
  });

  const url = signedDownloadUrl(doc.storageKey, doc.format, { resourceType: doc.resourceType });

  return {
    id: doc._id,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    bytes: doc.bytes,
    url,
    // Told to the client so a UI does not cache a URL that is about to stop working.
    expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
  };
}

// --- delete -----------------------------------------------------------------------

/**
 * Soft delete. The Cloudinary asset is deliberately left in place: a case history that
 * loses its evidence cannot be audited, and the retention/purge policy that decides when
 * bytes are actually destroyed is still owed.
 */
export async function deleteDocument(id, actor, ctx = {}) {
  const doc = await findScopedOrFail(id, actor);

  doc.deletedAt = new Date();
  await doc.save();

  // Clear the case file's permit pointer only if it names THIS document — deleting an
  // older superseded scan must not detach the current one.
  if (PERMIT_KINDS.has(doc.kind)) {
    const beneficiary = await getBeneficiaryById(doc.beneficiary, actor, {
      select: '+immigration.documentId',
    });
    if (String(beneficiary.immigration?.documentId) === String(doc._id)) {
      await setPermitDocument(doc.beneficiary, null, actor, ctx).catch((err) =>
        logger.error({ err, document: String(doc._id) }, 'failed to unlink permit document')
      );
    }
  }

  await audit.record({
    actor,
    action: ACTIONS.DOCUMENT_DELETED,
    targetType: 'Document',
    targetId: doc._id,
    ctx,
    meta: { beneficiary: String(doc.beneficiary), kind: doc.kind },
  });

  return doc;
}
