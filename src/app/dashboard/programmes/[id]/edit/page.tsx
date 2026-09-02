import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { ProgrammeForm } from '@/features/programmes/ProgrammeForm';

export const metadata: Metadata = { title: 'Edit programme' };

export default async function EditProgrammePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <RequirePermission permission={PERMISSIONS.PROGRAMME_UPDATE}>
      <ProgrammeForm id={id} />
    </RequirePermission>
  );
}
