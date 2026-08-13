import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { CaseList } from '@/features/cases/CaseList';

export const metadata: Metadata = { title: 'Cases' };

/*
 * The caseload, behind the permission that governs it.
 *
 * Renders an explanation rather than redirecting for someone without case:read — a silent
 * bounce reads as a broken link and gets reported as one. Rows are scoped server-side, so
 * defeating this guard in the console buys an explanation screen and a string of 403s.
 */
export default function CasesPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CASE_READ}>
      <CaseList />
    </RequirePermission>
  );
}
