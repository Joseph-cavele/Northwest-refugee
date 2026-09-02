import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { TemplateBuilder } from '@/features/screening/TemplateBuilder';

export const metadata: Metadata = { title: 'Screening form' };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <RequirePermission permission={PERMISSIONS.SCREENING_TEMPLATE_MANAGE}>
      <TemplateBuilder id={id} />
    </RequirePermission>
  );
}
