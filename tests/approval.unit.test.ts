import { describe, expect, it } from 'vitest';
import { describeApproval, APPROVAL_CEILINGS_CENTS } from '@/features/finance/lib/approval';

/*
 * The financial controls, as the queue predicts them.
 *
 * Every test here has a matching guard in finance.service.js, which is the thing that
 * actually enforces them. These exist so the SCREEN never offers an approval the server
 * will refuse — and, just as importantly, never withholds one it would allow.
 */

const ME = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SOMEONE_ELSE = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const pending = {
  status: 'PENDING_APPROVAL',
  amountCents: 100_000, // R1 000
  actorId: ME,
  hasApprovePermission: true,
};

describe('describeApproval', () => {
  it('offers nothing on a transaction that is not awaiting a decision', () => {
    for (const status of ['DRAFT', 'APPROVED', 'REJECTED', 'REVERSED']) {
      expect(
        describeApproval({
          ...pending,
          status,
          createdBy: SOMEONE_ELSE,
          actorRole: 'EXECUTIVE_DIRECTOR',
        })
      ).toEqual({ kind: 'NOT_PENDING' });
    }
  });

  it('refuses the creator their own transaction, whatever their role', () => {
    // The Executive Director has an unlimited ceiling and is still not exempt.
    expect(
      describeApproval({ ...pending, createdBy: ME, actorRole: 'EXECUTIVE_DIRECTOR' })
    ).toEqual({ kind: 'OWN_RECORD' });
  });

  it('reports self-approval BEFORE the ceiling, exactly as the service checks them', () => {
    // Creator and over their limit. The server calls assertDifferentActor first, so the
    // explanation on screen must be the self-approval one or the two disagree.
    expect(
      describeApproval({
        ...pending,
        amountCents: 9_000_000, // R90 000, far above an admin officer's R5 000
        createdBy: ME,
        actorRole: 'ADMIN_OFFICER',
      })
    ).toEqual({ kind: 'OWN_RECORD' });
  });

  it('gives a finance officer no approval authority at all', () => {
    // They originate spend and may never approve it — the absent ceiling IS the control.
    expect(APPROVAL_CEILINGS_CENTS.FINANCE_OFFICER).toBeUndefined();
    expect(
      describeApproval({ ...pending, createdBy: SOMEONE_ELSE, actorRole: 'FINANCE_OFFICER' })
    ).toEqual({ kind: 'NO_AUTHORITY' });
  });

  it('escalates an amount above the approver’s ceiling', () => {
    expect(
      describeApproval({
        ...pending,
        amountCents: 600_000, // R6 000
        createdBy: SOMEONE_ELSE,
        actorRole: 'ADMIN_OFFICER', // ceiling R5 000
      })
    ).toEqual({ kind: 'ABOVE_CEILING', amountCents: 600_000, ceilingCents: 500_000 });
  });

  it('allows exactly the ceiling — the limit is inclusive, as on the server', () => {
    // The service refuses only `amountCents > ceiling`. An off-by-one here would block a
    // legitimate approval at precisely the delegated limit.
    expect(
      describeApproval({
        ...pending,
        amountCents: 500_000,
        createdBy: SOMEONE_ELSE,
        actorRole: 'ADMIN_OFFICER',
      })
    ).toMatchObject({ kind: 'CAN_APPROVE' });
  });

  it('allows someone else’s transaction within the ceiling', () => {
    expect(
      describeApproval({ ...pending, createdBy: SOMEONE_ELSE, actorRole: 'PROJECT_COORDINATOR' })
    ).toMatchObject({ kind: 'CAN_APPROVE', ceilingCents: 1_000_000 });
  });

  it('withholds approval when the permission is missing', () => {
    expect(
      describeApproval({
        ...pending,
        hasApprovePermission: false,
        createdBy: SOMEONE_ELSE,
        actorRole: 'EXECUTIVE_DIRECTOR',
      })
    ).toEqual({ kind: 'NO_PERMISSION' });
  });

  it('fails closed when either identity is unknown', () => {
    // Guessing "probably someone else" on a segregation-of-duties control is the one
    // error worth refusing to make.
    expect(
      describeApproval({ ...pending, actorId: null, createdBy: SOMEONE_ELSE, actorRole: 'EXECUTIVE_DIRECTOR' })
    ).toEqual({ kind: 'OWN_RECORD' });
    expect(
      describeApproval({ ...pending, createdBy: null, actorRole: 'EXECUTIVE_DIRECTOR' })
    ).toEqual({ kind: 'OWN_RECORD' });
  });

  it('lets the Executive Director approve any amount', () => {
    expect(
      describeApproval({
        ...pending,
        amountCents: 5_000_000_00,
        createdBy: SOMEONE_ELSE,
        actorRole: 'EXECUTIVE_DIRECTOR',
      })
    ).toMatchObject({ kind: 'CAN_APPROVE' });
  });
});
