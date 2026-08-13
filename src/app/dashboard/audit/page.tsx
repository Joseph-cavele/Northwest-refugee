import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { AuditTrail } from '@/features/audit/AuditTrail';

export const metadata: Metadata = { title: 'Audit trail' };

/*
 * The trail covers everyone, so the permission is the whole of the access control — there
 * is no row-level scoping to fall back on here as there is elsewhere. audit:read is held
 * by three office roles (Executive Director, Admin Officer, M&E Officer) and nobody in the
 * field, because a trail narrowed to one person's caseload cannot answer the question it
 * exists for.
 */
export default function AuditPage() {
  return (
    <RequirePermission permission={PERMISSIONS.AUDIT_READ}>
      <AuditTrail />
    </RequirePermission>
  );
}
