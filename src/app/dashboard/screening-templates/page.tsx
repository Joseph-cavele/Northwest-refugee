import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { TemplateList } from '@/features/screening/TemplateList';

export const metadata: Metadata = { title: 'Screening forms' };

export default function TemplatesPage() {
  return (
    <RequirePermission permission={PERMISSIONS.SCREENING_TEMPLATE_MANAGE}>
      <TemplateList />
    </RequirePermission>
  );
}
