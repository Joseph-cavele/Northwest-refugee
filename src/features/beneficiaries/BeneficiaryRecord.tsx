'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Home,
  Languages,
  Phone,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { getBeneficiary } from '@/api/beneficiaries.api';
import { StatusPill } from './StatusPill';
import { SensitivePanel } from './SensitivePanel';
import { DocumentsPanel } from './DocumentsPanel';
import { VerifyActions } from './VerifyActions';
import { PermitStanding } from './PermitStanding';
import {
  CONSENT_METHOD_LABELS,
  GENDER_LABELS,
  INTAKE_CHANNEL_LABELS,
  LANGUAGE_LABELS,
} from '@/types/enums';
import type { Id } from '@/types/models';
import { formatDate, formatDateTime } from '@/lib/dates';

/*
 * One person's record.
 *
 * WHAT IS DELIBERATELY ABSENT, and why each one is absent:
 *
 *   The permit number, the vulnerability flags and the email address are not on this
 *   payload at all — select:false server-side, stripped again by the model's toJSON. They
 *   are reached through SensitivePanel, which is a separate, audited request.
 *
 *   capturedBy, verifiedBy and assignedOfficer arrive as bare ObjectIds; this endpoint
 *   does not populate them. So the screen shows WHEN a record was verified and never by
 *   whom — a 24-character hex string is not an answer to "who", and printing one invites
 *   a caseworker to read it out as if it were. The names live in the audit trail, which
 *   is the right place to ask that question anyway. Populate the refs server-side and
 *   this becomes a two-line change.
 *
 * The date of birth IS shown here, unlike on the register: this is a record someone
 * opened on purpose, and age is what decides guardian requirements and child protection.
 */

// --- small pieces ---------------------------------------------------------------

function Section({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface p-5', className)}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-body">
        <Icon className="size-4 text-subtle" aria-hidden="true" />
        {title}
      </h2>
      <dl className="mt-3">{children}</dl>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-line py-2.5 first:border-t-0 first:pt-0 sm:flex-row sm:gap-4 sm:py-2">
      <dt className="shrink-0 text-sm text-subtle sm:w-40 sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 flex-1 text-base text-body">{children}</dd>
    </div>
  );
}

/** An em dash, never an empty cell — a blank reads as a rendering fault, not as absence. */
function Blank() {
  return <span className="text-subtle">—</span>;
}

// --- the screen -----------------------------------------------------------------

export function BeneficiaryRecord({ id }: { id: Id }) {
  const { can } = useAuth();
  // One instant for the whole screen, fixed on mount. See the note in BeneficiaryList.
  const [now] = useState(() => Date.now());

  const { data, loading, error, reload } = useApi(
    useCallback((signal: AbortSignal) => getBeneficiary(id, signal), [id]),
    [id]
  );

  if (loading) return <Spinner label="Loading the record" className="py-24" />;

  if (error) {
    return (
      <div className="flex flex-col items-start gap-4">
        <BackLink />
        <ErrorAlert error={error}>
          {error.code === 'NOT_FOUND' &&
            // The server answers 404 for "no such record" AND for "not yours to see", on
            // purpose — a 403 would confirm the person is on the register. So the copy has
            // to cover both without guessing which one happened.
            'Either no record has that reference, or it is outside the records your role covers.'}
        </ErrorAlert>
        <Button variant="subtle" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const person = data;
  const consentWithdrawn = person.consent?.withdrawnAt !== null;

  const [preferred, ...otherLanguages] = person.languages ?? [];

  return (
    <div className="flex flex-col gap-5">
      <BackLink />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">
              {person.fullName}
            </h1>
            <StatusPill status={person.status} />
            {person.isMinor && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2.5 py-1 text-xs font-bold tracking-wide text-danger-700 uppercase">
                <ShieldAlert className="size-3.5" aria-hidden="true" />
                Minor
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-base text-subtle">{person.referenceCode}</p>
        </div>

        {can(PERMISSIONS.BENEFICIARY_VERIFY) && (
          <VerifyActions id={person._id} status={person.status} onDone={reload} />
        )}
      </header>

      {/*
        * The permit's own state is NOT repeated as an alert here — the band below says it
        * at greater size and with the dates attached. A banner saying the same thing three
        * inches above trains people to skim past banners, which is exactly what must not
        * happen to the two below it.
        */}
      <PermitStanding
        immigrationStatus={person.immigration.status}
        permitType={person.immigration.permitType}
        issuedAt={person.immigration.permitIssuedAt}
        expiresAt={person.immigration.permitExpiresAt}
        serverSaysExpired={person.permitExpired}
        now={now}
      />

      {/*
        * What is left is the set of facts with a consequence today that the band cannot
        * carry. Each stays at the top rather than sitting in a panel someone has to scroll to.
        */}
      <div className="flex flex-col gap-2 empty:hidden">
        {consentWithdrawn && (
          <Alert tone="error">
            <strong className="font-semibold">
              Consent withdrawn {formatDate(person.consent.withdrawnAt)}.
            </strong>{' '}
            The record is retained because retention may be required, but no further
            processing may take place — do not enrol, message or refer this person.
          </Alert>
        )}
        {person.isMinor && !person.guardian && (
          <Alert tone="error">
            <strong className="font-semibold">No guardian recorded for a minor.</strong> Raise
            this with the Admin Officer today; a child on the register without a recorded
            guardian is a child-protection gap.
          </Alert>
        )}
        {person.status === 'EXITED' && (
          <Alert tone="info">
            Exited {formatDate(person.exitAt)}
            {person.exitReason ? ` — ${person.exitReason}` : ''}.
          </Alert>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/*
            * Directly under the permit band, because the number is the one thing the band
            * cannot show: it is select:false server-side and one audited request away.
            */}
          <SensitivePanel beneficiaryId={person._id} referenceCode={person.referenceCode} />

          {/*
            * Next to the permit, because the scan of it is the commonest thing anyone opens
            * here. Documents have no page of their own — the list endpoint requires a
            * beneficiary, so this record is the only place they can be reached from.
            */}
          <DocumentsPanel beneficiaryId={person._id} />

          <Section title="Person" icon={UserRound}>
            <Fact label="Full name">{person.fullName}</Fact>
            <Fact label="Date of birth">
              {formatDate(person.dateOfBirth)}
              {person.age !== null && (
                <span className="ml-2 text-muted">
                  ({person.age} {person.age === 1 ? 'year' : 'years'})
                </span>
              )}
            </Fact>
            <Fact label="Gender">{GENDER_LABELS[person.gender]}</Fact>
            <Fact label="Nationality">{person.nationality}</Fact>
            <Fact label="Languages">
              {preferred ? (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Languages className="size-3.5 text-subtle" aria-hidden="true" />
                  {/*
                    * The first language is the PREFERRED one — it decides which WhatsApp
                    * prompts this person receives and whether an interpreter is needed for
                    * an appointment. Listing all four as equals would lose that.
                    */}
                  <span className="font-medium">{LANGUAGE_LABELS[preferred]}</span>
                  <span className="text-sm text-subtle">preferred</span>
                  {otherLanguages.length > 0 && (
                    <span className="text-muted">
                      · also {otherLanguages.map((l) => LANGUAGE_LABELS[l]).join(', ')}
                    </span>
                  )}
                </span>
              ) : (
                <Blank />
              )}
            </Fact>
          </Section>

          <Section title="Contact" icon={Phone}>
            <Fact label="Cellphone">
              <a
                href={`tel:${person.contact.cellphone}`}
                className="text-brand-600 underline underline-offset-2"
              >
                {person.contact.cellphone}
              </a>
            </Fact>
            <Fact label="Address">{person.contact.address || <Blank />}</Fact>
            <Fact label="Suburb">{person.contact.suburb || <Blank />}</Fact>
            <Fact label="City">{person.contact.city || <Blank />}</Fact>
            <Fact label="Province">{person.contact.province || <Blank />}</Fact>
          </Section>

          <Section title="Household" icon={Home}>
            <Fact label="Household size">
              {person.household.size} {person.household.size === 1 ? 'person' : 'people'}
            </Fact>
            <Fact label="Dependants">{person.household.dependants}</Fact>
            <Fact label="Head of household">
              {person.household.headOfHousehold ? 'Yes' : 'No'}
            </Fact>
          </Section>

          {person.guardian && (
            <Section title="Guardian" icon={ShieldAlert}>
              <Fact label="Name">{person.guardian.fullName}</Fact>
              <Fact label="Relationship">{person.guardian.relationship}</Fact>
              <Fact label="Phone">
                {person.guardian.phone ? (
                  <a
                    href={`tel:${person.guardian.phone}`}
                    className="text-brand-600 underline underline-offset-2"
                  >
                    {person.guardian.phone}
                  </a>
                ) : (
                  <Blank />
                )}
              </Fact>
              <Fact label="Legal guardian">
                {person.guardian.isLegalGuardian ? (
                  'Yes'
                ) : (
                  // Not a detail: an unaccompanied child placed with an adult who has no
                  // legal standing changes who may consent to what on their behalf.
                  <span className="font-medium text-accent-800">
                    No — a placement, not a legal guardian
                  </span>
                )}
              </Fact>
            </Section>
          )}

          {person.notes && (
            <Section title="Notes" icon={UserRound}>
              <p className="text-base whitespace-pre-wrap text-body">{person.notes}</p>
            </Section>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {/*
            * Consent gets its own panel rather than a line in "Record", because it is the
            * first thing an auditor asks about and the one fact that governs whether
            * anything else here may be used at all.
            */}
          <Section
            title="Consent"
            icon={consentWithdrawn ? AlertTriangle : CheckCircle2}
            className={consentWithdrawn ? 'border-danger-100 bg-danger-50/40' : ''}
          >
            <Fact label="Given">
              {person.consent.given ? (
                <span className="font-medium text-success-700">Yes</span>
              ) : (
                <span className="font-medium text-danger-700">No</span>
              )}
            </Fact>
            <Fact label="When">{formatDateTime(person.consent.givenAt)}</Fact>
            <Fact label="How">{CONSENT_METHOD_LABELS[person.consent.method]}</Fact>
            {/* Which wording was agreed to. Without it, editing the consent text later
                makes every historical consent unprovable. */}
            <Fact label="Policy version">{person.consent.policyVersion}</Fact>
            <Fact label="Withdrawn">
              {person.consent.withdrawnAt ? (
                <span className="font-semibold text-danger-700">
                  {formatDate(person.consent.withdrawnAt)}
                </span>
              ) : (
                'No'
              )}
            </Fact>
          </Section>

          <Section title="Record" icon={CalendarClock}>
            <Fact label="Registered">{formatDateTime(person.createdAt)}</Fact>
            <Fact label="Came in via">{INTAKE_CHANNEL_LABELS[person.intakeChannel]}</Fact>
            <Fact label="Verified">
              {person.verifiedAt ? formatDateTime(person.verifiedAt) : 'Not yet verified'}
            </Fact>
            <Fact label="Last updated">{formatDateTime(person.updatedAt)}</Fact>
            <Fact label="Programmes">
              {person.programmes.length > 0 ? (
                `${person.programmes.length} enrolled`
              ) : (
                <span className="text-muted">None</span>
              )}
            </Fact>
          </Section>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/beneficiaries"
      className="inline-flex w-fit items-center gap-1.5 text-base text-muted underline-offset-2 hover:text-brand-600 hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to the register
    </Link>
  );
}

export default BeneficiaryRecord;
