import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { TemplateBuilder } from '@/features/screening/TemplateBuilder';

export const metadata: Metadata = { title: 'New screening form' };

/*
 * `/new` beside `[id]`: Next resolves the static segment first, and a template id is 24 hex
 * characters, so there is no ambiguity.
 */
export default function NewTemplatePage() {
  return (
    <RequirePermission permission={PERMISSIONS.SCREENING_TEMPLATE_MANAGE}>
      <TemplateBuilder />
    </RequirePermission>
  );
}
