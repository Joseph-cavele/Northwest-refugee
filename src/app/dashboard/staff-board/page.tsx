import type { Metadata } from 'next';
import RequirePermission from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/auth/permissions';
import { StaffBoard } from '@/features/chatboard/StaffBoard';

export const metadata: Metadata = { title: 'Staff board' };

/*
 * chatboard:read answers "may they use the board at all" — it is not what decides which
 * channels they see. A private channel is members-only regardless of it, enforced server
 * side, so this guard is the outer door and the membership check is the inner one.
 *
 * Posting is chatboard:post and gated separately inside the screen.
 */
export default function StaffBoardPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CHATBOARD_READ}>
      <StaffBoard />
    </RequirePermission>
  );
}
