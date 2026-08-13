import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { DocumentLibrary } from '@/features/documents/DocumentLibrary';

export const metadata: Metadata = { title: 'Documents' };

/*
 * Guarded on document:read, which buys the LIST and nothing else. Fetching a file needs
 * document:download and happens on the person's record, where the reason for opening it is
 * evident from the context — an audit entry is worth more when that is true.
 *
 * Rows are scoped server-side to the beneficiaries this role covers, by the same row-level
 * check the per-record path makes, so defeating this guard buys an explanation screen and a
 * list the server would have narrowed anyway.
 */
export default function DocumentsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.DOCUMENT_READ}>
      <DocumentLibrary />
    </RequirePermission>
  );
}
