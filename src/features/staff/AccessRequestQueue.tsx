'use client';

import { useCallback, useState } from 'react';
import { Check, Clock, Mail, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useSubmit } from '@/hooks/useSubmit';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Pager } from '@/components/ui/pager';
import { Spinner } from '@/components/ui/spinner';
import {
  approveAccessRequest,
  departmentOf,
  listAccessRequests,
  rejectAccessRequest,
} from '@/api/accessRequests.api';
import type { AccessRequest, ListAccessRequestsQuery } from '@/api/accessRequests.api';
import { getAccessRequestOptions } from '@/api/auth.api';
import { ACCESS_REQUEST_STATUSES, ROLE_LABELS, ROLES } from '@/types/enums';
import type { AccessRequestStatus, Role } from '@/types/enums';
import { formatCount } from '@/lib/format';
import { formatDate, formatDateTime } from '@/lib/dates';

/*
 * Who has asked to work here, and what happens to them.
 *
 * THIS SCREEN IS THE ONLY WAY ANYONE ELSE EVER SIGNS IN. The public form writes a PENDING
 * request and nothing else; until somebody approves it there is no account, no invitation
 * and no password. Without this page the only person who can reach the dashboard is
 * whoever the seed script created.
 *
 * WHAT APPROVAL ACTUALLY DOES, and why the copy says so: it creates a staff account with
 * status `invited` and emails an activation link. It does NOT let the person in. They are
 * in once they open that link and choose a password of their own — which is why there is
 * no control anywhere in this app for setting an account to `active` by hand. An
 * administrator who could do that could sign in as them.
 *
 * ONLY AN EXECUTIVE DIRECTOR MAY GRANT THE EXECUTIVE DIRECTOR ROLE. The server refuses it
 * otherwise; the role list below leaves the option out rather than offering something that
 * returns 403 — the same principle as the finance approval queue.
 *
 * A REJECTION REASON IS EMAILED TO THE APPLICANT. It is not an internal note, and the
 * placeholder says so: somebody who asked to work here reads it.
 */

const PAGE_SIZE = 25;

const STATUS_TONE: Record<AccessRequestStatus, string> = {
  PENDING: 'bg-accent-50 text-accent-800',
  APPROVED: 'bg-success-50 text-success-700',
  REJECTED: 'bg-ink-100 text-ink-600',
};

export function AccessRequestQueue() {
  const { user, can } = useAuth();
  const mayReview = can(PERMISSIONS.ACCESS_REQUEST_REVIEW);

  const [status, setStatus] = useState<AccessRequestStatus | ''>('PENDING');
  const [page, setPage] = useState(1);
  const [decision, setDecision] = useState<{
    request: AccessRequest;
    kind: 'approve' | 'reject';
  } | null>(null);

  const { data, loading, error, reload } = useApi(
    useCallback(
      (signal: AbortSignal) => {
        const query: ListAccessRequestsQuery = {
          page,
          limit: PAGE_SIZE,
          // Oldest first: the queue is answered in the order people applied.
          sort: 'createdAt',
          ...(status ? { status } : {}),
        };
        return listAccessRequests(query, signal);
      },
      [page, status]
    ),
    [page, status]
  );

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Access requests</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          People who have asked for a staff account. Approving creates the account and emails
          an activation link — they choose their own password from there.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(['PENDING', ...ACCESS_REQUEST_STATUSES.filter((s) => s !== 'PENDING')] as const).map(
          (value) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
              className={cn(
                'min-h-10 rounded-full border px-4 text-sm font-medium transition-colors',
                status === value
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-line bg-surface text-body hover:border-line-strong'
              )}
            >
              {value === 'PENDING' ? 'Waiting' : value === 'APPROVED' ? 'Approved' : 'Rejected'}
            </button>
          )
        )}
        <button
          type="button"
          aria-pressed={status === ''}
          onClick={() => {
            setStatus('');
            setPage(1);
          }}
          className={cn(
            'min-h-10 rounded-full border px-4 text-sm font-medium transition-colors',
            status === ''
              ? 'border-brand-500 bg-brand-500 text-white'
              : 'border-line bg-surface text-body hover:border-line-strong'
          )}
        >
          All
        </button>
      </div>

      {error && (
        <div className="flex flex-col items-start gap-3">
          <ErrorAlert error={error} />
          <Button variant="subtle" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {loading && !data && <Spinner label="Loading access requests" className="py-20" />}

      {data && rows.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <UserPlus className="mx-auto size-5 text-subtle" aria-hidden="true" />
          <p className="mt-2 text-sm text-body">
            {status === 'PENDING' ? 'Nobody is waiting for a decision.' : 'Nothing here.'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            Requests arrive from the public “Request staff access” form.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <p className="text-sm text-muted">
            {formatCount(meta?.total ?? rows.length)}{' '}
            {(meta?.total ?? 0) === 1 ? 'request' : 'requests'}
            {status === 'PENDING' && ', oldest first'}
          </p>

          <ul className="flex flex-col gap-2">
            {rows.map((request) => {
              const department = departmentOf(request);
              return (
                <li key={request._id} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-body">
                          {request.firstName} {request.lastName}
                        </h2>
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
                            STATUS_TONE[request.status]
                          )}
                        >
                          {request.status === 'PENDING' ? 'Waiting' : request.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                        <span className="flex items-center gap-1.5">
                          <Mail className="size-3.5" aria-hidden="true" />
                          {request.email}
                        </span>
                        <span>{request.phone}</span>
                        <span>asked for {ROLE_LABELS[request.requestedRole]}</span>
                        {department && <span>{department.name}</span>}
                        <span className="flex items-center gap-1.5">
                          <Clock className="size-3.5" aria-hidden="true" />
                          {formatDate(request.createdAt)}
                        </span>
                      </div>

                      {request.motivation && (
                        <p className="mt-2 max-w-prose text-xs text-muted italic">
                          “{request.motivation}”
                        </p>
                      )}

                      {request.status === 'APPROVED' && (
                        <p className="mt-2 text-xs text-success-700">
                          Approved {formatDateTime(request.reviewedAt)}
                          {request.grantedRole && ` as ${ROLE_LABELS[request.grantedRole]}`}.{' '}
                          {/*
                            * Stated because approval is often mistaken for "they can log in
                            * now". They cannot until they open the emailed link.
                            */}
                          <span className="text-muted">
                            The account is invited until they set a password.
                          </span>
                        </p>
                      )}
                      {request.status === 'REJECTED' && request.decisionNote && (
                        <p className="mt-2 text-xs text-muted">
                          Rejected {formatDate(request.reviewedAt)} — {request.decisionNote}
                        </p>
                      )}
                    </div>

                    {mayReview && request.status === 'PENDING' && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDecision({ request, kind: 'reject' })}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-xs font-semibold text-body hover:border-line-strong hover:bg-ink-50"
                        >
                          <X className="size-3.5" aria-hidden="true" />
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => setDecision({ request, kind: 'approve' })}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-500 px-3.5 text-xs font-semibold text-white hover:bg-brand-700"
                        >
                          <Check className="size-3.5" aria-hidden="true" />
                          Approve
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {meta && <Pager meta={meta} onPage={setPage} label="Access request pages" />}

      {decision && (
        <DecisionDialog
          request={decision.request}
          kind={decision.kind}
          actorRole={user?.role}
          onClose={() => setDecision(null)}
          onDone={reload}
        />
      )}
    </div>
  );
}

function DecisionDialog({
  request,
  kind,
  actorRole,
  onClose,
  onDone,
}: {
  request: AccessRequest;
  kind: 'approve' | 'reject';
  actorRole: Role | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const [role, setRole] = useState<Role>(request.requestedRole);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');

  const options = useApi(
    useCallback((signal: AbortSignal) => getAccessRequestOptions(signal), []),
    []
  );

  const { submit, busy, error, fieldErrors } = useSubmit(
    async () => {
      if (kind === 'reject') return rejectAccessRequest(request._id, reason.trim());
      return approveAccessRequest(request._id, {
        ...(role !== request.requestedRole ? { role } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
    },
    {
      onSuccess: () => {
        onDone();
        onClose();
      },
    }
  );

  /*
   * The public form's option list deliberately omits EXECUTIVE_DIRECTOR, so it is added
   * back here only for an approver who is one — mirroring assertMayGrantRole rather than
   * offering a choice the server will refuse.
   */
  const grantableRoles: readonly Role[] =
    actorRole === 'EXECUTIVE_DIRECTOR'
      ? ROLES
      : ROLES.filter((r) => r !== 'EXECUTIVE_DIRECTOR');

  const blocked = kind === 'reject' && reason.trim().length === 0;

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={
        kind === 'approve'
          ? `Approve ${request.firstName} ${request.lastName}?`
          : `Reject ${request.firstName} ${request.lastName}?`
      }
      footer={
        <>
          <Button variant="subtle" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={blocked} onClick={() => void submit()}>
            {kind === 'approve' ? 'Approve and invite' : 'Reject'}
          </Button>
        </>
      }
    >
      {error && <ErrorAlert error={error} />}

      <div className="flex flex-col gap-4">
        {kind === 'approve' ? (
          <>
            <Alert tone="info">
              This creates a staff account and emails {request.email} a link to set a
              password. They cannot sign in until they use it — the link is valid for seven
              days.
            </Alert>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-body">
                Role{' '}
                <span className="font-normal text-subtle">
                  (they asked for {ROLE_LABELS[request.requestedRole]})
                </span>
              </span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
                disabled={busy || !options.data}
                className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm text-body hover:border-line-strong focus:border-brand-400"
              >
                {grantableRoles.map((value) => (
                  <option key={value} value={value}>
                    {ROLE_LABELS[value]}
                  </option>
                ))}
              </select>
              {fieldErrors.role && (
                <span className="text-xs text-danger-700">{fieldErrors.role}</span>
              )}
              {actorRole !== 'EXECUTIVE_DIRECTOR' && (
                <span className="text-xs text-subtle">
                  Only an Executive Director can grant the Executive Director role.
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-body">
                Note <span className="font-normal text-subtle">(optional, internal)</span>
              </span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                maxLength={500}
                disabled={busy}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-body hover:border-line-strong focus:border-brand-400"
              />
            </label>
          </>
        ) : (
          <>
            <Alert tone="info">
              Rejection is final. If you change your mind later, invite them directly instead.
            </Alert>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-body">Reason</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={500}
                // Not an internal note. The wording matters because the applicant reads it.
                placeholder="Emailed to the applicant. Write it to be read by them."
                disabled={busy}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400"
              />
              {fieldErrors.reason ? (
                <span className="text-xs text-danger-700">{fieldErrors.reason}</span>
              ) : (
                <span className="text-xs text-subtle">
                  Required. Somebody who asked to work here is owed an answer.
                </span>
              )}
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}

export default AccessRequestQueue;
