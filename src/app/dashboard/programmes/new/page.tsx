import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { ProgrammeForm } from '@/features/programmes/ProgrammeForm';

export const metadata: Metadata = { title: 'New programme' };

export default function NewProgrammePage() {
  return (
    <RequirePermission permission={PERMISSIONS.PROGRAMME_CREATE}>
      <ProgrammeForm />
    </RequirePermission>
  );
}
