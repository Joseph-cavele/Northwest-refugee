'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { ErrorAlert } from '@/components/ui/alert';
import { useSubmit } from '@/hooks/useSubmit';
import { verifyBeneficiary } from '@/api/beneficiaries.api';
import type { BeneficiaryStatus } from '@/types/enums';
import type { Id } from '@/types/models';

/*
 * Accept or reject an intake.
 *
 * This is the decision the register's "Pending verification" filter exists to queue up,
 * and it is not a small one: verifying moves someone to ACTIVE, which is what puts them in
 * front of services; rejecting puts them in REJECTED with the reason appended to the record
 * for the next officer to read. Both stamp the decider's name and both write an audit entry
 * whatever the outcome, so both go through a confirmation rather than a bare button.
 *
 * OFFERED ONLY WHERE IT MEANS SOMETHING. The server would happily re-verify an ACTIVE
 * record — nothing stops it — but "verify" on someone verified last month is a control with
 * no question behind it, and pressing it would silently restamp the record with a new name
 * and date. So it appears for the two statuses that are actually awaiting a decision.
 */

const AWAITING_DECISION: readonly BeneficiaryStatus[] = ['DRAFT', 'PENDING_VERIFICATION'];

export interface VerifyActionsProps {
  id: Id;
  status: BeneficiaryStatus;
  /** Re-fetch the record so the new status and stamp are what the screen shows. */
  onDone: () => void;
}

export function VerifyActions({ id, status, onDone }: VerifyActionsProps) {
  const [decision, setDecision] = useState<'verify' | 'reject' | null>(null);
  const [reason, setReason] = useState('');

  const { submit, busy, error, fieldErrors, reset } = useSubmit(verifyBeneficiary, {
    onSuccess: () => {
      setDecision(null);
      setReason('');
      onDone();
    },
  });

  if (!AWAITING_DECISION.includes(status)) return null;

  function close() {
    if (busy) return; // Closing mid-request would leave the outcome unreported.
    setDecision(null);
    reset();
  }

  const rejecting = decision === 'reject';
  // Mirrors the server's superRefine. Enforced here too so the reason is asked for while
  // the person is still thinking about it, rather than bounced back after they commit.
  const missingReason = rejecting && reason.trim().length === 0;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="subtle"
          className="px-5 py-2"
          onClick={() => {
            reset();
            setDecision('reject');
          }}
        >
          <X className="size-4" aria-hidden="true" />
          Reject
        </Button>
        <Button
          className="px-5 py-2"
          onClick={() => {
            reset();
            setDecision('verify');
          }}
        >
          <Check className="size-4" aria-hidden="true" />
          Verify
        </Button>
      </div>

      <Modal
        open={decision !== null}
        onClose={close}
        title={rejecting ? 'Reject this intake?' : 'Verify this intake?'}
        description={
          rejecting
            ? 'The record moves to Rejected and your reason is added to it. Your name and the time are recorded.'
            : 'The record moves to Active and this person can be enrolled and referred. Your name and the time are recorded.'
        }
        footer={
          <>
            <Button variant="subtle" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={missingReason}
              onClick={() =>
                void submit(id, {
                  verified: !rejecting,
                  ...(reason.trim() ? { reason: reason.trim() } : {}),
                })
              }
            >
              {rejecting ? 'Reject' : 'Verify'}
            </Button>
          </>
        }
      >
        {error && <ErrorAlert error={error} />}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-body">
            Reason {rejecting ? '' : <span className="text-subtle">(optional)</span>}
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder={
              rejecting
                ? 'What is missing or wrong? The next officer reads this.'
                : 'Anything worth recording about this decision.'
            }
            disabled={busy}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400"
          />
          {fieldErrors.reason && (
            <span className="text-xs text-danger-700">{fieldErrors.reason}</span>
          )}
          {rejecting && !fieldErrors.reason && (
            <span className="text-xs text-subtle">
              Required. &ldquo;Rejected&rdquo; with no reason leaves the next officer nothing
              to act on.
            </span>
          )}
        </label>
      </Modal>
    </>
  );
}

export default VerifyActions;
