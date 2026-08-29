'use client';

import { useCallback, useRef, useState } from 'react';
import { Download, FileText, Image as ImageIcon, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useSubmit } from '@/hooks/useSubmit';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import {
  ACCEPT_ATTRIBUTE,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABELS,
  MAX_UPLOAD_BYTES,
  listDocuments,
  requestDownload,
  uploadDocument,
} from '@/api/documents.api';
import type { DocumentKind, DocumentRow } from '@/api/documents.api';
import type { Id } from '@/types/models';
import { formatDate } from '@/lib/dates';
import { formatBytes } from '@/lib/format';

/*
 * The documents held for one person.
 *
 * WHY THIS IS A PANEL ON A RECORD AND NOT A PAGE IN THE SIDEBAR. The list endpoint requires
 * a beneficiary id — not optionally, by schema — and the server says why in as many words:
 * "A document is always viewed inside a case file, and asking for one beneficiary at a time
 * is what lets access be checked exactly." There is no query that returns every identity
 * document NWHR holds, so there is no screen that can show one. Access is checked through
 * the beneficiary service before a single document row is read.
 *
 * READING THE LIST AND FETCHING A FILE ARE DIFFERENT PERMISSIONS, and the split is the
 * whole point: knowing a passport scan exists is not the same act as opening it.
 * `document:read` renders the list below; `document:download` is what mints a URL, and
 * every mint writes a DOCUMENT_DOWNLOADED entry naming the reader — written BEFORE the URL
 * exists, so the safe failure is "no access" rather than "untraceable access".
 *
 * NO URL IS EVER HELD. The signed URL expires in five minutes and is handed straight to a
 * new tab; it is never put in an href a reader could copy, never cached, and never kept in
 * state that outlives the click.
 */

export interface DocumentsPanelProps {
  beneficiaryId: Id;
}

export function DocumentsPanel({ beneficiaryId }: DocumentsPanelProps) {
  const { can } = useAuth();
  const mayRead = can(PERMISSIONS.DOCUMENT_READ);
  const mayDownload = can(PERMISSIONS.DOCUMENT_DOWNLOAD);
  const mayUpload = can(PERMISSIONS.DOCUMENT_CREATE);

  const [wanted, setWanted] = useState<DocumentRow | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data, loading, error, reload } = useApi(
    useCallback(
      (signal: AbortSignal) =>
        mayRead
          ? listDocuments({ beneficiary: beneficiaryId, limit: 50 }, signal)
          : Promise.resolve(null),
      [beneficiaryId, mayRead]
    ),
    [beneficiaryId, mayRead]
  );

  if (!mayRead) {
    // Role-based and record-neutral: says the system stores documents, nothing about this
    // person. Rendering nothing would leave a caseworker hunting for a panel that is never
    // going to appear.
    return null;
  }

  const rows = data?.data ?? [];

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-body">
          <FileText className="size-4 text-subtle" aria-hidden="true" />
          Documents
          {data && (
            <span className="font-normal text-subtle">
              ({data.meta.total})
            </span>
          )}
        </h2>
        {mayUpload && (
          <Button variant="subtle" className="px-4 py-2" onClick={() => setUploading(true)}>
            <Upload className="size-4" aria-hidden="true" />
            Upload
          </Button>
        )}
      </div>

      {error && (
        <div className="mt-3 flex flex-col items-start gap-2">
          <ErrorAlert error={error} />
          <Button variant="subtle" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {loading && !data && <Spinner label="Loading documents" className="py-8" />}

      {data && rows.length === 0 && (
        <p className="mt-3 text-base text-muted">
          Nothing uploaded yet. Permits, identity documents and signed consent forms belong
          here rather than in a shared drive.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {rows.map((row) => (
            <li key={row._id} className="flex flex-wrap items-center gap-3 py-3">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink-50 text-subtle"
              >
                {row.isImage ? (
                  <ImageIcon className="size-4" />
                ) : (
                  <FileText className="size-4" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium text-body">
                  {DOCUMENT_KIND_LABELS[row.kind]}
                </p>
                {/* The uploaded filename can itself carry a person's name, so it is
                    secondary text rather than the heading — present, not advertised. */}
                <p className="truncate text-sm text-subtle">
                  {row.originalName} · {formatBytes(row.bytes)} · {formatDate(row.createdAt)}
                </p>
              </div>

              {mayDownload ? (
                <button
                  type="button"
                  onClick={() => setWanted(row)}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-semibold text-body hover:border-line-strong hover:bg-ink-50"
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  Open
                  <span className="sr-only">
                    {DOCUMENT_KIND_LABELS[row.kind]}, {row.originalName}
                  </span>
                </button>
              ) : (
                // The row still lists — knowing the scan exists is what document:read
                // buys. Fetching it is a different permission and says so.
                <span className="shrink-0 text-sm text-subtle">View not permitted</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {wanted && (
        <DownloadDialog document={wanted} onClose={() => setWanted(null)} />
      )}
      {uploading && (
        <UploadDialog
          beneficiaryId={beneficiaryId}
          onClose={() => setUploading(false)}
          onDone={reload}
        />
      )}
    </section>
  );
}

// --- opening a file ------------------------------------------------------------------

function DownloadDialog({
  document: doc,
  onClose,
}: {
  document: DocumentRow;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [blocked, setBlocked] = useState<{ url: string } | null>(null);

  const { submit, busy, error } = useSubmit(
    async (id: Id, why: string | undefined, target: Window | null) => {
      const grant = await requestDownload(id, why);
      if (target) {
        target.location.href = grant.url;
        return null;
      }
      // The browser refused the tab. Hand over a link the person can click themselves —
      // that click is a fresh user gesture and will open. It dies with this dialog.
      return grant.url;
    },
    { onSuccess: (url) => (url ? setBlocked({ url }) : onClose()) }
  );

  function open() {
    /*
     * The tab is opened SYNCHRONOUSLY, before the request, and navigated once the URL
     * arrives. Calling window.open() after an await is no longer inside the user gesture
     * and is blocked by default in every current browser — which would make this button
     * silently do nothing.
     *
     * `noopener` is not passed because it forces window.open to return null, and the
     * handle is exactly what is needed here. The opener reference is severed by hand
     * instead, so the Cloudinary page cannot reach back into the dashboard.
     */
    const target = window.open('about:blank', '_blank');
    if (target) target.opener = null;
    void submit(doc._id, reason.trim() || undefined, target);
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={`Open ${DOCUMENT_KIND_LABELS[doc.kind]}?`}
      description="Opening this file is recorded against your name."
      footer={
        !blocked && (
          <>
            <Button variant="subtle" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button loading={busy} onClick={open}>
              {busy ? 'Opening…' : 'Open and record'}
            </Button>
          </>
        )
      }
    >
      {error && <ErrorAlert error={error} />}

      {blocked ? (
        <div className="flex flex-col gap-3">
          <Alert tone="info">Your browser blocked the new tab.</Alert>
          <a
            href={blocked.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full bg-brand-500 px-5 text-base font-semibold text-white hover:bg-brand-700"
          >
            <Download className="size-4" aria-hidden="true" />
            Open {doc.originalName}
          </a>
          {/* The link expires in about five minutes and the read is already recorded, so
              there is nothing to gain by keeping this dialog open. */}
          <p className="text-sm text-subtle">
            This link stops working in about five minutes. The read has already been
            recorded.
          </p>
        </div>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-base font-medium text-body">
            Reason <span className="text-subtle">(optional)</span>
          </span>
          <input
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={200}
            placeholder="e.g. Verifying the permit against Home Affairs"
            disabled={busy}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-base text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400"
          />
          <span className="text-sm text-subtle">
            An audit trail of who opened what, with no why, answers half the question.
          </span>
        </label>
      )}
    </Modal>
  );
}

// --- adding one ----------------------------------------------------------------------

function UploadDialog({
  beneficiaryId,
  onClose,
  onDone,
}: {
  beneficiaryId: Id;
  onClose: () => void;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<DocumentKind>('ASYLUM_PERMIT');
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { submit, busy, error, fieldErrors } = useSubmit(uploadDocument, {
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  // Checked here only so someone is not made to wait for a 10 MB upload that the server
  // was always going to refuse. The server re-checks the real bytes; that is the rule.
  const tooBig = file !== null && file.size > MAX_UPLOAD_BYTES;

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Upload a document"
      footer={
        <>
          <Button variant="subtle" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!file || tooBig}
            onClick={() => file && void submit({ beneficiary: beneficiaryId, kind, file })}
          >
            Upload
          </Button>
        </>
      }
    >
      {error && <ErrorAlert error={error} />}

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-base font-medium text-body">Document type</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as DocumentKind)}
            disabled={busy}
            className="min-h-10 rounded-lg border border-line bg-surface px-3 text-base text-body hover:border-line-strong focus:border-brand-400"
          >
            {DOCUMENT_KINDS.map((value) => (
              <option key={value} value={value}>
                {DOCUMENT_KIND_LABELS[value]}
              </option>
            ))}
          </select>
          {fieldErrors.kind && <span className="text-sm text-danger-700">{fieldErrors.kind}</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-base font-medium text-body">File</span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            disabled={busy}
            className="rounded-lg border border-line bg-surface p-2 text-base text-body file:mr-3 file:rounded-full file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-body"
          />
          <span className={cn('text-sm', tooBig ? 'font-medium text-danger-700' : 'text-subtle')}>
            {tooBig
              ? `That file is ${formatBytes(file.size)}. The limit is 10 MB.`
              : 'JPG, PNG, WEBP, HEIC or PDF, up to 10 MB. A phone photo of a permit fits.'}
          </span>
          {fieldErrors.file && <span className="text-sm text-danger-700">{fieldErrors.file}</span>}
        </label>

        <p className="text-sm text-subtle">
          The file goes straight to secure storage and is never written to this server. It
          can only be opened again through this record, and every opening is recorded.
        </p>
      </div>
    </Modal>
  );
}

export default DocumentsPanel;
