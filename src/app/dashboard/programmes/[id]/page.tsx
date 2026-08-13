import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { ProgrammeDetail } from '@/features/programmes/ProgrammeDetail';

export const metadata: Metadata = { title: 'Programme' };

export default async function ProgrammeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next 16 hands params over as a promise; awaiting here keeps the client component
  // taking a plain string rather than one it would have to unwrap with `use()`.
  const { id } = await params;

  return (
    <RequirePermission permission={PERMISSIONS.PROGRAMME_READ}>
      <ProgrammeDetail id={id} />
    </RequirePermission>
  );
}
