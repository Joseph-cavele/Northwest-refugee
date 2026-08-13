'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { FileText, Image as ImageIcon, Lock, ScrollText } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pager } from '@/components/ui/pager';
import { Spinner } from '@/components/ui/spinner';
import { DOCUMENT_KINDS, DOCUMENT_KIND_LABELS, listDocuments, ownerOf } from '@/api/documents.api';
import type { DocumentKind, DocumentRow, ListDocumentsQuery } from '@/api/documents.api';
import { formatCount, formatBytes } from '@/lib/format';
import { formatDate } from '@/lib/dates';

/*
 * Every document the signed-in person may see.
 *
 * THE SCOPING IS THE WHOLE STORY HERE. This list once did not exist, because the server
 * required a beneficiary id on the grounds that asking one record at a time is what let
 * access be checked exactly rather than approximated with a join. That reasoning was right,
 * so the register-wide view keeps it: the server resolves which beneficiaries this caller
 * may see — the identical row-level check — and filters to that set. A volunteer's library
 * is the documents of the people they captured, and nothing a caller sends can widen it.
 *
 * WHAT IT STILL WILL NOT DO. It does not fetch a single file. `document:read` lists that a
 * scan exists; `document:download` is what mints a URL and writes an audit entry naming the
 * reader, and that action stays on the person's record where the reason for opening it is
 * obvious. A library screen is for finding a document, not for browsing identity papers —
 * so each row links to the case file it belongs to, and the file is opened from there.
 */

const PAGE_SIZE = 25;

function Owner({ row }: { row: DocumentRow }) {
  const owner = ownerOf(row);
  if (!owner) return <span className="text-subtle">—</span>;

  return (
    <div className="min-w-0">
      <Link
        href={`/dashboard/beneficiaries/${owner._id}`}
        className="block truncate font-medium text-body underline-offset-2 hover:text-brand-600 hover:underline"
      >
        {owner.firstName} {owner.lastName}
      </Link>
      <span className="block truncate font-mono text-xs text-subtle">{owner.referenceCode}</span>
    </div>
  );
}

export function DocumentLibrary() {
  const { can } = useAuth();
  const mayDownload = can(PERMISSIONS.DOCUMENT_DOWNLOAD);

  const [kind, setKind] = useState<DocumentKind | ''>('');
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useApi(
    useCallback(
      (signal: AbortSignal) => {
        const query: ListDocumentsQuery = {
          page,
          limit: PAGE_SIZE,
          sort: '-createdAt',
          ...(kind ? { kind } : {}),
        };
        return listDocuments(query, signal);
      },
      [page, kind]
    ),
    [page, kind]
  );

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Documents</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          {meta
            ? // "you can see" is not filler: the list is scoped to the records this role
              // covers, so it is not the organisation's total and must not read as one.
              `${formatCount(meta.total)} ${meta.total === 1 ? 'document' : 'documents'} you can see`
            : 'Permits, identity documents and signed consent forms.'}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Filter by document type</span>
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as DocumentKind | '');
              setPage(1);
            }}
            className="min-h-10 rounded-full border border-line bg-surface px-4 text-sm text-body hover:border-line-strong"
          >
            <option value="">Every type</option>
            {DOCUMENT_KINDS.map((value) => (
              <option key={value} value={value}>
                {DOCUMENT_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!mayDownload && (
        // Said once, at the top, rather than repeated as a disabled control on every row.
        <Alert tone="info">
          You can see which documents exist. Opening one needs a role that includes
          downloading them.
        </Alert>
      )}

      {error && (
        <div className="flex flex-col items-start gap-3">
          <ErrorAlert error={error} />
          <Button variant="subtle" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {loading && !data && <Spinner label="Loading documents" className="py-20" />}

      {data && rows.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <ScrollText className="mx-auto size-5 text-subtle" aria-hidden="true" />
          <p className="mt-2 text-sm text-body">
            {kind ? 'No documents of that type.' : 'No documents have been uploaded yet.'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            Documents are uploaded from a person&rsquo;s record, which is also where they are
            opened.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line md:hidden">
            {rows.map((row) => (
              <li key={row._id} className="flex flex-col gap-2 px-4 py-3.5">
                <Owner row={row} />
                <p className="text-sm text-body">{DOCUMENT_KIND_LABELS[row.kind]}</p>
                <p className="truncate text-xs text-subtle">
                  {row.originalName} · {formatBytes(row.bytes)} · {formatDate(row.createdAt)}
                </p>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <caption className="sr-only">Documents you can see</caption>
              <thead>
                <tr className="border-b border-line text-left">
                  {['Person', 'Type', 'File', 'Size', 'Uploaded', ''].map((heading, i) => (
                    <th
                      key={heading || `actions-${i}`}
                      scope="col"
                      className="px-4 py-3 text-[0.6875rem] font-semibold tracking-[0.08em] text-subtle uppercase"
                    >
                      {heading || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const owner = ownerOf(row);
                  return (
                    <tr key={row._id} className="border-b border-line last:border-0 hover:bg-ink-25">
                      <td className="px-4 py-3">
                        <Owner row={row} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 text-body">
                          {row.isImage ? (
                            <ImageIcon className="size-3.5 text-subtle" aria-hidden="true" />
                          ) : (
                            <FileText className="size-3.5 text-subtle" aria-hidden="true" />
                          )}
                          {DOCUMENT_KIND_LABELS[row.kind]}
                        </span>
                      </td>
                      {/* Secondary, because an uploaded filename can itself carry a
                          person's name — present, not advertised. */}
                      <td className="max-w-[16rem] truncate px-4 py-3 text-xs text-subtle">
                        {row.originalName}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted tabular-nums">
                        {formatBytes(row.bytes)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {formatDate(row.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {owner ? (
                          /*
                            * The file is opened on the record, not here. Opening one is
                            * audited, and an audit entry is worth far more when the reason
                            * is obvious from where it was done.
                            */
                          <Link
                            href={`/dashboard/beneficiaries/${owner._id}`}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold text-body hover:border-line-strong hover:bg-ink-50"
                          >
                            Open record
                            <span className="sr-only">
                              for {owner.firstName} {owner.lastName}
                            </span>
                          </Link>
                        ) : (
                          <Lock className="ml-auto size-3.5 text-subtle" aria-hidden="true" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {meta && <Pager meta={meta} onPage={setPage} label="Document pages" />}
    </div>
  );
}

export default DocumentLibrary;
