import { api } from './client';
import type { Id, IsoDate } from '@/types/models';
import type { Paginated } from '@/types/api';

/*
 * The /documents endpoints, typed.
 *
 * A REGISTER-WIDE LIST EXISTS, AND IT IS SCOPED EXACTLY, NOT APPROXIMATELY. `beneficiary`
 * is optional: supplied, the server scopes to one case file and 404s an out-of-scope
 * record before a document is read; omitted, it asks the beneficiary service which records
 * the caller may see and filters to precisely those. A volunteer's register-wide view is
 * therefore the documents of the people they captured and nobody else's — the same answer
 * the per-record path would give, asked once instead of many times.
 *
 * NO URL IS EVER STORED. The model keeps a Cloudinary storage key and strips it from JSON;
 * a viewing URL is signed per request with a five-minute expiry, so it cannot outlive the
 * permission check that produced it. Never cache one, never put one in a link someone can
 * copy out, and never write one into state that survives the page.
 */

export const DOCUMENT_KINDS = [
  'ASYLUM_PERMIT',
  'REFUGEE_ID',
  'PASSPORT',
  'BIRTH_CERTIFICATE',
  'PROOF_OF_ADDRESS',
  'MEDICAL_REPORT',
  'SCHOOL_RECORD',
  'REFERRAL_LETTER',
  'CONSENT_FORM',
  'OTHER',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** South African English, and the section numbers a caseworker actually says aloud. */
export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  ASYLUM_PERMIT: 'Asylum permit (s22)',
  REFUGEE_ID: 'Refugee ID (s24)',
  PASSPORT: 'Passport',
  BIRTH_CERTIFICATE: 'Birth certificate',
  PROOF_OF_ADDRESS: 'Proof of address',
  MEDICAL_REPORT: 'Medical report',
  SCHOOL_RECORD: 'School record',
  REFERRAL_LETTER: 'Referral letter',
  CONSENT_FORM: 'Consent form',
  OTHER: 'Other',
};

/** Whose document it is. Reference code and name only — never the whole record. */
export interface DocumentOwner {
  _id: Id;
  referenceCode: string;
  firstName: string;
  lastName: string;
  status: string;
}

export interface DocumentRow {
  _id: Id;
  /** Populated by the list endpoint; a bare id if it ever stops being. */
  beneficiary: DocumentOwner | Id;
  kind: DocumentKind;
  /** The filename as uploaded. Can carry a person's name — treat it as identifying. */
  originalName: string;
  mimeType: string;
  bytes: number;
  /** SHA-256 of the stored bytes: proves the file is the one originally accepted. */
  checksum: string;
  uploadedBy: Id;
  isImage: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface ListDocumentsQuery {
  /** Omit for every document the caller may see; supply it for one case file. */
  beneficiary?: Id;
  page?: number;
  limit?: number;
  kind?: DocumentKind;
  sort?: 'createdAt' | '-createdAt';
}

/**
 * Documents, scoped to the caller either way.
 *
 * With a `beneficiary`, access is checked through the beneficiary service before any
 * document is read, so a record outside the caller's scope answers 404 — never a partial
 * list. Without one, the server resolves the set of records the caller may see and filters
 * to it, which is the same check applied to many rows rather than one.
 */
export function listDocuments(
  query: ListDocumentsQuery = {},
  signal?: AbortSignal
): Promise<Paginated<DocumentRow>> {
  return api.list<DocumentRow>('/documents', {
    query: query as unknown as Record<string, string | number | boolean>,
    signal,
  });
}

/** The populated owner, or null when the server sent a bare id. */
export function ownerOf(row: DocumentRow): DocumentOwner | null {
  return row.beneficiary && typeof row.beneficiary === 'object' ? row.beneficiary : null;
}

export interface DownloadGrant {
  id: Id;
  originalName: string;
  mimeType: string;
  bytes: number;
  /** Signed and short-lived. Use it immediately; do not store it. */
  url: string;
  /** 300 at the time of writing. Told to the client so nothing caches a dead URL. */
  expiresInSeconds: number;
}

/**
 * Mint a signed, expiring URL for one document.
 *
 * NEEDS `document:download`, WHICH IS NOT `document:read`. Listing that a permit scan
 * exists is not the same act as fetching it, and the two are separate permissions for
 * exactly that reason.
 *
 * Every call writes a DOCUMENT_DOWNLOADED audit entry naming the actor — and the service
 * writes it BEFORE minting the URL, so that if auditing and issuing cannot both happen the
 * failure is "no access" rather than "untraceable access". Do not call this to prefetch, to
 * render a thumbnail, or on mount.
 *
 * @param reason free text, capped at 200 by the server, recorded in the audit entry.
 */
export function requestDownload(id: Id, reason?: string): Promise<DownloadGrant> {
  return api.get<DownloadGrant>(`/documents/${id}/download`, {
    query: reason ? { reason } : undefined,
  });
}

// --- upload --------------------------------------------------------------------------

/** Mirrors config/uploads.js. A phone photo of a permit fits inside 10 MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic', // what an iPhone produces by default
  'application/pdf',
] as const;

/** For an `<input accept>`. HEIC is included because half the photos taken here are HEIC. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_MIME_TYPES.join(',');

/**
 * Upload one identity document.
 *
 * Sent as multipart because the endpoint reads `request.formData()`; the bytes go from the
 * browser to Cloudinary via the route without ever being written to this server's disk. A
 * permit scan on a filesystem would survive the request, land in a backup, and sit outside
 * every access control in this codebase.
 *
 * The server re-checks the real bytes — magic numbers and true size — so the limits mirrored
 * above are a courtesy to the person choosing a file, never the enforcement.
 */
export function uploadDocument(input: {
  beneficiary: Id;
  kind: DocumentKind;
  file: File;
}): Promise<DocumentRow> {
  const form = new FormData();
  // The field name the route's readUpload() looks for. Changing it here breaks the upload
  // with "No file was uploaded" and nothing else.
  form.append('file', input.file);
  form.append('beneficiary', input.beneficiary);
  form.append('kind', input.kind);

  return api.post<DocumentRow>('/documents', form);
}
