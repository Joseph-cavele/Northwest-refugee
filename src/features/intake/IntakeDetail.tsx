'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ClipboardCheck, Phone, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useSubmit } from '@/hooks/useSubmit';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  INTAKE_SOURCE_LABELS,
  INTAKE_STATUS_LABELS,
  beneficiaryOf,
  getIntake,
  programmeOf,
} from '@/api/intakes.api';
import { listScreenings, startScreening } from '@/api/screening.api';
import { GENDER_LABELS, IMMIGRATION_STATUS_LABELS, LANGUAGE_LABELS } from '@/types/enums';
import type { Id } from '@/types/models';
import { formatDate, formatDateTime } from '@/lib/dates';

/*
 * One application, and the way into screening it.
 *
 * WHAT THIS SCREEN IS CAREFUL ABOUT. Everything here is somebody who has asked for help and
 * been promised nothing. The page says that in as many words at the top, because the risk on
 * an internal screen is not that a stranger reads it — it is that a member of staff reads a
 * detailed personal record and assumes the organisation has taken the person on.
 */

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-3 first:border-t-0 first:pt-0">
      <dt className="text-sm font-medium text-subtle">{term}</dt>
      <dd className="mt-0.5 text-base text-body">{children}</dd>
    </div>
  );
}

const NOT_SAID = <span className="text-subtle">Not said</span>;

export function IntakeDetail({ id }: { id: Id }) {
  const router = useRouter();
  const { can } = useAuth();

  const { data, loading, error, reload } = useApi(
    useCallback((signal: AbortSignal) => getIntake(id, signal), [id]),
    [id]
  );

  /*
   * Any screening already attached to this application — including one the applicant
   * completed themselves on the public form, which arrives populated and undecided. Without
   * this the page would offer "Start screening" for a screening that already exists, and the
   * server would quietly hand back the existing one, which is correct but confusing.
   */
  const { data: screenings } = useApi(
    useCallback(
      (signal: AbortSignal) => listScreenings({ intake: id, limit: 5 }, signal).then((p) => p.data),
      [id]
    ),
    [id]
  );

  const begin = useSubmit(
    async () => startScreening({ intake: id }),
    { onSuccess: (screening) => router.push(`/dashboard/screening/${screening._id}`) }
  );

  if (loading && !data) return <Spinner label="Loading the application" className="py-24" />;

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorAlert error={error} />
        <Button variant="subtle" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const linked = beneficiaryOf(data);
  const programme = programmeOf(data);
  const existing = screenings?.[0] ?? null;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Link
        href="/dashboard/intake"
        className="inline-flex w-fit items-center gap-1.5 text-base text-muted underline-offset-2 hover:text-brand-600 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to intake
      </Link>

      <header>
        <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
          Application · {INTAKE_SOURCE_LABELS[data.source]}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">
            {data.firstName} {data.lastName}
          </h1>
          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-sm font-semibold text-ink-600">
            {INTAKE_STATUS_LABELS[data.status]}
          </span>
        </div>
        <p className="mt-1 font-mono text-sm text-subtle">{data.reference}</p>
      </header>

      {/*
        * Said plainly, at the top, on every application that has not been approved. A
        * detailed record on an internal screen reads as an accepted person unless something
        * says otherwise.
        */}
      {!linked && (
        <Alert tone="info">
          <strong className="font-semibold">This person is not on the register.</strong> They
          have asked for help and nobody has decided yet. Approving a screening is what
          creates their record.
        </Alert>
      )}

      {linked && (
        <Alert tone="success">
          <strong className="font-semibold">Already on the register.</strong>{' '}
          <Link
            href={`/dashboard/beneficiaries/${linked._id}`}
            className="underline underline-offset-4"
          >
            {linked.firstName} {linked.lastName} · {linked.referenceCode}
          </Link>
        </Alert>
      )}

      {/* --- what to do next ------------------------------------------------------- */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-body">Screening</h2>

        {existing ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-prose text-base text-muted">
              {existing.selfCompleted
                ? 'This person answered the questions themselves when they applied. Review their answers and decide.'
                : existing.status === 'COMPLETED'
                  ? 'Screening is complete.'
                  : 'A screening is already open for this application.'}
            </p>
            <Link
              href={`/dashboard/screening/${existing._id}`}
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-brand-500 px-5 text-base font-semibold text-white transition-colors hover:bg-brand-700"
            >
              <ClipboardCheck className="size-4" aria-hidden="true" />
              {existing.status === 'COMPLETED' ? 'Open the screening' : 'Continue screening'}
            </Link>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-prose text-base text-muted">
              {programme
                ? `They applied for ${programme.name}. Starting will load that programme's questions.`
                : 'No programme was named, so the screening starts with notes and a decision.'}
            </p>
            {can(PERMISSIONS.SCREENING_CONDUCT) && (
              <Button loading={begin.busy} onClick={() => void begin.submit()} className="px-5 py-2">
                <UserCheck className="size-4" aria-hidden="true" />
                Start screening
              </Button>
            )}
          </div>
        )}

        {begin.error && (
          <div className="mt-3">
            <ErrorAlert error={begin.error} />
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-body">The person</h2>
          <dl className="mt-3">
            <Fact term="Date of birth">
              {data.dateOfBirth ? formatDate(data.dateOfBirth) : NOT_SAID}
            </Fact>
            <Fact term="Gender">{data.gender ? GENDER_LABELS[data.gender] : NOT_SAID}</Fact>
            <Fact term="Nationality">{data.nationality || NOT_SAID}</Fact>
            <Fact term="Language">
              {data.languages?.length
                ? data.languages.map((l) => LANGUAGE_LABELS[l]).join(', ')
                : NOT_SAID}
            </Fact>
            <Fact term="Immigration status">
              {data.immigrationStatus
                ? IMMIGRATION_STATUS_LABELS[data.immigrationStatus]
                : NOT_SAID}
            </Fact>
            <Fact term="Household">
              {data.household.size} in the household, {data.household.dependants} dependants
            </Fact>
          </dl>
        </section>

        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-body">Contact and request</h2>
          <dl className="mt-3">
            <Fact term="Cellphone">
              {data.contact.cellphone ? (
                <a
                  href={`tel:${data.contact.cellphone}`}
                  className="inline-flex items-center gap-1.5 font-medium text-brand-600 underline-offset-4 hover:underline"
                >
                  <Phone className="size-3.5" aria-hidden="true" />
                  {data.contact.cellphone}
                </a>
              ) : (
                NOT_SAID
              )}
            </Fact>
            <Fact term="Address">
              {[data.contact.address, data.contact.suburb].filter(Boolean).join(', ') || NOT_SAID}
            </Fact>
            <Fact term="Asking for">
              {programme?.name ?? data.requestedSupport ?? NOT_SAID}
            </Fact>
            <Fact term="Received">{formatDateTime(data.receivedAt)}</Fact>
            {data.referredBy && <Fact term="Referred by">{data.referredBy}</Fact>}
          </dl>
        </section>
      </div>

      {(data.reasonForVisit || data.notes) && (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-body">In their own words</h2>
          {data.reasonForVisit && (
            <p className="mt-2 text-base leading-7 whitespace-pre-line text-muted">
              {data.reasonForVisit}
            </p>
          )}
          {data.notes && (
            <p
              className={cn(
                'text-base leading-7 whitespace-pre-line text-subtle',
                data.reasonForVisit ? 'mt-4 border-t border-line pt-4' : 'mt-2'
              )}
            >
              {data.notes}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

export default IntakeDetail;
