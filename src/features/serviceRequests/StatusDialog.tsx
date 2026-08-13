'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { useSubmit } from '@/hooks/useSubmit';
import { transitionServiceRequest, STATUS_TRANSITIONS } from '@/api/serviceRequests.api';
import type { ServiceRequestRow } from '@/api/serviceRequests.api';
import { SERVICE_REQUEST_STATUS_LABELS } from '@/types/enums';
import type { ServiceRequestStatus } from '@/types/enums';

/*
 * Move a request to its next status.
 *
 * THE MENU OFFERS ONLY WHAT THE SERVER WILL ACCEPT. The transition table is mirrored from
 * the model, so a resolved request shows no moves at all rather than a set of buttons that
 * each return a 409. The server is still the authority — it refuses an invalid jump with a
 * message naming the alternatives — and this table can only ever narrow what is shown.
 *
 * REFERRED IS DELIBERATELY NOT OFFERED HERE. The server requires a referral record id with
 * it, and there is no screen yet that creates one; putting REFERRED in this menu would
 * produce a dialog nobody can submit. It comes back the day the referrals screen lands.
 *
 * Notes are required for RESOLVED and CANCELLED — that is the server's rule, mirrored so
 * the requirement is felt while someone is still writing rather than after they commit.
 */

const NOTES_REQUIRED: readonly ServiceRequestStatus[] = ['RESOLVED', 'CANCELLED'];

const PROMPT: Partial<Record<ServiceRequestStatus, string>> = {
  RESOLVED: 'How was it resolved? This is the record of what the person actually received.',
  CANCELLED: 'Why is it being cancelled?',
  ON_HOLD: 'What is it waiting on?',
  IN_PROGRESS: 'Anything worth recording as this starts.',
};

export interface StatusDialogProps {
  request: ServiceRequestRow;
  open: boolean;
  onClose: () => void;
  /** Re-fetch the queue so the row shows its new status. */
  onDone: () => void;
}

export function StatusDialog({ request, open, onClose, onDone }: StatusDialogProps) {
  const [status, setStatus] = useState<ServiceRequestStatus | ''>('');
  const [notes, setNotes] = useState('');

  const { submit, busy, error, fieldErrors, reset } = useSubmit(transitionServiceRequest, {
    onSuccess: () => {
      setStatus('');
      setNotes('');
      onDone();
      onClose();
    },
  });

  const available = STATUS_TRANSITIONS[request.status].filter((next) => next !== 'REFERRED');
  const needsNotes = status !== '' && NOTES_REQUIRED.includes(status);
  const blocked = status === '' || (needsNotes && notes.trim().length === 0);

  function close() {
    if (busy) return; // Closing mid-request would leave the outcome unreported.
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Update ${request.reference}`}
      description="The change is recorded against your name."
      footer={
        <>
          <Button variant="subtle" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={blocked || available.length === 0}
            onClick={() =>
              status !== '' &&
              void submit(request._id, {
                status,
                ...(notes.trim() ? { notes: notes.trim() } : {}),
              })
            }
          >
            Save
          </Button>
        </>
      }
    >
      {error && <ErrorAlert error={error} />}

      {available.length === 0 ? (
        <Alert tone="info">
          A {SERVICE_REQUEST_STATUS_LABELS[request.status].toLowerCase()} request is final.
          Reopening is not allowed — record a recurring need as a new request, so the same
          piece of work is never counted twice.
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-body">Move to</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ServiceRequestStatus | '')}
              disabled={busy}
              className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm text-body hover:border-line-strong focus:border-brand-400"
            >
              <option value="">Choose a status…</option>
              {available.map((next) => (
                <option key={next} value={next}>
                  {SERVICE_REQUEST_STATUS_LABELS[next]}
                </option>
              ))}
            </select>
            {fieldErrors.status && (
              <span className="text-xs text-danger-700">{fieldErrors.status}</span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-body">
              Notes{' '}
              {!needsNotes && status !== '' && <span className="text-subtle">(optional)</span>}
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={status === '' ? '' : (PROMPT[status] ?? '')}
              disabled={busy || status === ''}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400 disabled:bg-sunken"
            />
            {fieldErrors.notes ? (
              <span className="text-xs text-danger-700">{fieldErrors.notes}</span>
            ) : (
              needsNotes && (
                <span className="text-xs text-subtle">
                  Required. This is what the next person reads, and what a funder&rsquo;s
                  auditor sees.
                </span>
              )
            )}
          </label>

          {/* The note can quote a beneficiary directly, so it stays on the record rather
              than going into the audit trail — worth saying where it is being written. */}
          <p className="text-xs text-subtle">
            Notes stay on this request. Do not paste anyone&rsquo;s permit number or
            identity document details into them.
          </p>
        </div>
      )}
    </Modal>
  );
}

export default StatusDialog;
