import mongoose from 'mongoose';

const { Schema } = mongoose;

// Metadata for a file held in Cloudinary. The file itself never touches this server's
// disk, and no URL is ever stored: a viewing URL is signed with a short expiry at request
// time, so it cannot outlive the permission check that produced it.

export const DOCUMENT_KINDS = Object.freeze([
  'ASYLUM_PERMIT', // s22
  'REFUGEE_ID', // s24
  'PASSPORT',
  'BIRTH_CERTIFICATE',
  'PROOF_OF_ADDRESS',
  'MEDICAL_REPORT',
  'SCHOOL_RECORD',
  'REFERRAL_LETTER',
  'CONSENT_FORM',
  'OTHER',
]);

const documentSchema = new Schema(
  {
    beneficiary: { type: Schema.Types.ObjectId, ref: 'Beneficiary', required: true, index: true },
    kind: { type: String, enum: DOCUMENT_KINDS, default: 'OTHER', index: true },

    // Cloudinary public_id. Useless on its own — a private asset needs a signed URL — but
    // stripped from JSON anyway, since nothing outside the service layer needs it.
    storageKey: { type: String, required: true },
    // Cloudinary splits delivery by resource_type; a PDF and a JPEG sign differently, so
    // both this and `format` are needed to rebuild a download URL.
    resourceType: { type: String, enum: ['image', 'raw', 'video'], default: 'image' },
    format: { type: String, default: null },

    originalName: { type: String, required: true, trim: true, maxlength: 255 },
    mimeType: { type: String, required: true, trim: true },
    bytes: { type: Number, required: true, min: 0 },
    // SHA-256 of the uploaded bytes: detects a re-upload of the same scan, and proves the
    // stored file is the one that was originally accepted.
    checksum: { type: String, required: true, index: true },

    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Kept for the same reason as the beneficiary record: a purge policy is still owed,
    // and destroying a document silently would break the case history it evidences.
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, toObject: { virtuals: true } }
);

documentSchema.index({ beneficiary: 1, createdAt: -1 });
// The same file uploaded twice against one beneficiary is a duplicate, not a new record.
documentSchema.index({ beneficiary: 1, checksum: 1 }, { unique: true });

documentSchema.virtual('isImage').get(function isImage() {
  return String(this.mimeType).startsWith('image/');
});

documentSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    // The storage handle is an internal detail; clients receive a signed URL instead.
    delete ret.storageKey;
    delete ret.__v;
    return ret;
  },
});

const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);

export default Document;
