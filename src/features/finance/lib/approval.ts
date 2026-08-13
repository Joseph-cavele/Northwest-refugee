import type { Role } from '@/types/enums';
import type { Id } from '@/types/models';

/*
 * May THIS person approve THIS transaction — and if not, why not.
 *
 * Holding `transaction:approve` is necessary and never sufficient. Two further controls
 * decide it, and both live in finance.service.js rather than in the role table:
 *
 *   MAKER-CHECKER  the creator can never approve their own transaction, whatever their
 *                  role. The Executive Director included.
 *   CEILING        an approver may only approve up to their delegated limit; above it the
 *                  decision escalates to the Executive Director.
 *
 * WHY MIRROR IT AT ALL. Not to enforce anything — the server re-checks both on every
 * request and is the only thing standing between a wrong answer here and a bad approval.
 * It is so the queue can say "you raised this one" instead of offering an Approve button
 * that returns 403. On a screen whose whole job is segregation of duties, a control that
 * looks available and is not teaches people the system is unreliable.
 *
 * THE ORDER OF THE CHECKS IS COPIED DELIBERATELY. The service calls assertDifferentActor
 * before assertWithinCeiling, so a creator who is also over their limit is told about the
 * self-approval first. If this module reported the ceiling instead, the explanation on
 * screen would differ from the one the server gives on the same record.
 */

/**
 * Mirror of APPROVAL_CEILINGS in src/server/config/constants.js, in cents.
 *
 * FINANCE_OFFICER IS DELIBERATELY ABSENT, and so is every other role: they originate spend
 * and may never approve it. A role with no entry cannot approve at all — an absent ceiling
 * is a deliberate zero, not an oversight, and adding one here would show an approve button
 * to someone the server will always refuse.
 *
 * The server's figures are flagged as placeholders pending NWHR's signed delegation-of-
 * authority schedule. When they are replaced, replace them here in the same commit.
 */
export const APPROVAL_CEILINGS_CENTS: Partial<Record<Role, number>> = {
  ADMIN_OFFICER: 500_000, // R5 000
  PROJECT_COORDINATOR: 1_000_000, // R10 000
  EXECUTIVE_DIRECTOR: Number.MAX_SAFE_INTEGER,
};

export type ApprovalStanding =
  /** Not awaiting a decision, so there is nothing to offer. */
  | { kind: 'NOT_PENDING' }
  /** Lacks transaction:approve entirely. */
  | { kind: 'NO_PERMISSION' }
  /** Maker-checker. Checked first, exactly as the server does. */
  | { kind: 'OWN_RECORD' }
  /** Holds the permission, but their role carries no delegated authority. */
  | { kind: 'NO_AUTHORITY' }
  | { kind: 'ABOVE_CEILING'; amountCents: number; ceilingCents: number }
  | { kind: 'CAN_APPROVE'; ceilingCents: number };

export function describeApproval({
  status,
  createdBy,
  amountCents,
  actorId,
  actorRole,
  hasApprovePermission,
}: {
  status: string;
  createdBy: Id | null;
  amountCents: number;
  actorId: Id | null;
  actorRole: Role | undefined;
  hasApprovePermission: boolean;
}): ApprovalStanding {
  if (status !== 'PENDING_APPROVAL') return { kind: 'NOT_PENDING' };
  if (!hasApprovePermission) return { kind: 'NO_PERMISSION' };

  /*
   * Maker-checker before the ceiling, matching the service. Note this is only reachable
   * when both ids are known: an unknown creator is NOT treated as "someone else", because
   * guessing in the permissive direction on a segregation-of-duties control is the one
   * error worth avoiding here.
   */
  if (actorId === null || createdBy === null) return { kind: 'OWN_RECORD' };
  if (String(createdBy) === String(actorId)) return { kind: 'OWN_RECORD' };

  const ceilingCents = actorRole ? APPROVAL_CEILINGS_CENTS[actorRole] : undefined;
  if (ceilingCents === undefined) return { kind: 'NO_AUTHORITY' };
  if (amountCents > ceilingCents) return { kind: 'ABOVE_CEILING', amountCents, ceilingCents };

  return { kind: 'CAN_APPROVE', ceilingCents };
}
