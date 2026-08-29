'use client';

import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldAlert } from 'lucide-react';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useSubmit } from '@/hooks/useSubmit';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { readSensitive } from '@/api/beneficiaries.api';
import type { SensitiveDisclosure } from '@/api/beneficiaries.api';
import { VULNERABILITY_FLAG_LABELS } from '@/types/enums';
import type { Id } from '@/types/models';
import { formatTime } from '@/lib/dates';

/*
 * The permit number, the vulnerability flags and the email address.
 *
 * The most damaging facts in the system, and the only component permitted to render them
 * (types/enums.ts says so beside the flag list). Three rules hold this together, and none
 * of them is a preference:
 *
 *   NOTHING IS FETCHED UNTIL SOMEONE ASKS. The endpoint writes a SENSITIVE_READ audit
 *   entry on every call, naming the reader and the fields. Loading it with the page would
 *   record a read for every glance at a record — filling the log with reads nobody
 *   performed, and burying the ones that matter. The audit trail is the control here; an
 *   automatic fetch is what breaks it.
 *
 *   THE PERSON IS TOLD BEFORE THEY ACT, not after. The button says the read is recorded,
 *   because a control whose consequence is only discoverable in an audit log is a trap.
 *
 *   A REASON IS ASKED FOR. The API leaves it optional. A log of who read what, with no
 *   why, answers half the question an auditor is actually asking — and the half it drops
 *   is the one that separates casework from curiosity.
 *
 * WHY HIDE EXISTS: this runs at a front desk. Someone reveals a permit number, is called
 * away, and the screen keeps showing it to the queue. Hiding drops it from memory; asking
 * again writes a second audit entry, which is correct — it was a second read.
 */

export interface SensitivePanelProps {
  beneficiaryId: Id;
  /** Shown against the disclosure so it is obvious whose record was opened. */
  referenceCode: string;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0 first:pt-0 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-sm font-semibold tracking-wide text-subtle uppercase sm:w-44 sm:pt-0.5">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-base text-body">{children}</dd>
    </div>
  );
}

export function SensitivePanel({ beneficiaryId, referenceCode }: SensitivePanelProps) {
  const { can } = useAuth();
  const [reason, setReason] = useState('');
  const [shown, setShown] = useState<{ at: number; reason: string; data: SensitiveDisclosure } | null>(
    null
  );

  const { submit, busy, error, reset } = useSubmit(readSensitive, {
    onSuccess: (data) => setShown({ at: Date.now(), reason: reason.trim(), data }),
  });

  /*
   * Role-based, never record-based: this says the system holds these fields for every
   * beneficiary, which is public knowledge, and nothing whatsoever about this person.
   * Rendering nothing at all would leave a caseworker hunting for a permit number that
   * was never going to appear.
   */
  if (!can(PERMISSIONS.BENEFICIARY_READ_SENSITIVE)) {
    return (
      <section className="rounded-xl border border-line bg-sunken p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-body">
          <Lock className="size-4 text-subtle" aria-hidden="true" />
          Protected information
        </h2>
        <p className="mt-2 max-w-prose text-base text-muted">
          Permit number, vulnerability flags and email address are held separately on every
          record and need a role that includes reading them. Ask an administrator if your work
          requires it.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-accent-200 bg-accent-50/40 p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-body">
        <ShieldAlert className="size-4 text-accent-700" aria-hidden="true" />
        Protected information
      </h2>

      {!shown ? (
        <>
          <p className="mt-2 max-w-prose text-base text-muted">
            Permit number, vulnerability flags and email address. Opening these is recorded
            against your name, with the reason you give below.
          </p>

          {error && (
            <div className="mt-3">
              <ErrorAlert error={error} />
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:max-w-md">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold tracking-wide text-subtle uppercase">
                Reason for opening
              </span>
              <input
                type="text"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  // Drop a previous failure the moment they change anything — leaving it
                  // under an input they have just edited reads as the edit not working.
                  if (error) reset();
                }}
                // The server caps this at 200 and rejects anything longer; matching the cap
                // here means the limit is felt while typing rather than on submit.
                maxLength={200}
                placeholder="e.g. Renewing this permit at Home Affairs"
                disabled={busy}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-base text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400"
              />
            </label>

            <Button
              variant="subtle"
              loading={busy}
              onClick={() => void submit(beneficiaryId, reason.trim() || undefined)}
              className="self-start"
            >
              <Eye className="size-4" aria-hidden="true" />
              {busy ? 'Opening…' : 'Show and record'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            {/*
              * Stated as a completed fact, in the past tense, because it is one: the entry
              * is already written. "This will be recorded" would be a lie by tense.
              */}
            <p className="text-sm text-muted">
              Recorded at {formatTime(shown.at)} against {shown.data.referenceCode || referenceCode}
              {shown.reason ? ` — “${shown.reason}”` : ' — no reason given'}
            </p>
            <button
              type="button"
              onClick={() => setShown(null)}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
            >
              <EyeOff className="size-3.5" aria-hidden="true" />
              Hide
            </button>
          </div>

          <dl className="mt-3 rounded-lg border border-line bg-surface px-4 py-3">
            <Row label="Permit number">
              {shown.data.permitDecryptionFailed ? (
                /*
                 * A key problem, not a fact about this person — so it says so, and says what
                 * to do. Rendering an em dash here would read as "no permit recorded", which
                 * is the opposite of the truth and could send someone to Home Affairs
                 * believing they have nothing to renew.
                 */
                <Alert tone="error" className="mt-0">
                  Stored, but could not be decrypted. The encryption key is missing or has
                  changed since this was saved — report this rather than re-capturing the
                  number.
                </Alert>
              ) : shown.data.permitNumber ? (
                <span className="font-mono break-all">{shown.data.permitNumber}</span>
              ) : (
                <span className="text-muted">
                  None recorded.{' '}
                  <span className="text-subtle">
                    Common, and not a gap in the record — many people NWHR serves are
                    undocumented.
                  </span>
                </span>
              )}
            </Row>

            <Row label="Vulnerability flags">
              {shown.data.vulnerabilityFlags.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {shown.data.vulnerabilityFlags.map((flag) => (
                    <li
                      key={flag}
                      className="rounded-full bg-danger-50 px-2.5 py-1 text-sm font-medium text-danger-700"
                    >
                      {VULNERABILITY_FLAG_LABELS[flag]}
                    </li>
                  ))}
                </ul>
              ) : (
                // Said in words. A blank space would be read as "not loaded".
                <span className="text-muted">None recorded.</span>
              )}
            </Row>

            <Row label="Email address">
              {shown.data.email ? (
                <a
                  href={`mailto:${shown.data.email}`}
                  className="break-all text-brand-600 underline underline-offset-2"
                >
                  {shown.data.email}
                </a>
              ) : (
                <span className="text-muted">None recorded.</span>
              )}
            </Row>
          </dl>

          <p className="mt-3 flex items-start gap-1.5 text-sm text-subtle">
            <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Do not copy these into a case note, an email or a report. They stay here.
          </p>
        </>
      )}
    </section>
  );
}

export default SensitivePanel;
