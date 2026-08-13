import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { BeneficiaryRecord } from '@/features/beneficiaries/BeneficiaryRecord';

/*
 * One person's record.
 *
 * The title is fixed and generic on purpose. Next puts it in the browser tab, the window
 * title and the history entry — putting a beneficiary's name there would write it into
 * screen-sharing sessions, shoulder-surfing range and the browser history of a shared
 * front-desk machine, none of which the permission system reaches.
 *
 * The id in the URL is not a secret and does not need to be: the server scopes every read
 * to the caller and answers 404 — never 403 — for a record outside their scope, so a
 * guessed id reveals nothing about whether that person exists.
 */
export const metadata: Metadata = { title: 'Beneficiary record' };

export default async function BeneficiaryRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next 16 hands params over as a promise; awaiting it here keeps the client component
  // taking a plain string rather than a promise it would have to unwrap with `use()`.
  const { id } = await params;

  return (
    <RequirePermission permission={PERMISSIONS.BENEFICIARY_READ}>
      <BeneficiaryRecord id={id} />
    </RequirePermission>
  );
}
